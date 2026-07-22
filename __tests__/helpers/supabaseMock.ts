/**
 * supabaseMock — an in-memory Supabase stand-in that supports WRITES.
 *
 * WHY THIS EXISTS
 * This repo has 1,631 tests and not one of them executes an API route — and
 * every write to a parameter mapping happens in a route. Four Supabase mocks
 * already exist (atlasFamilyCardFacts, manufacturerAliasResolver, …) but all
 * four are READ-ONLY and copy-pasted inline; none can answer "which rows did
 * this request actually write, with which filters, in which order". Those are
 * exactly the questions the Decision Log defects turned on.
 *
 * WHAT IT MODELS (each tied to a real defect class)
 *  - Writes mutate the in-memory table, so deactivate-then-insert is coherent
 *    and accept-vs-edit (`hadPrior`) is testable end to end.
 *  - Filters are recorded as an ORDERED list — `[['eq','id','x'],['eq','is_active',true]]`.
 *    Branch change #3 IS the presence of `.eq('is_active', true)`; asserting on
 *    the filter list pins it behaviourally instead of by regex over source text.
 *  - `opOrder(table)` — the partial unique index `(family_id, param_name) WHERE
 *    is_active` only tolerates select→update→insert. A reordering is silent in
 *    production and fatal.
 *  - Per-table, per-op error injection, so partial-failure branches (batch
 *    per-row fallback, undo's writeErr path) become reachable at all.
 *  - A write returns `data: null` UNLESS `.select()` was chained. Verified
 *    against the library, not assumed: `Prefer: return=representation` appears
 *    exactly once in @supabase/postgrest-js, set by `select()`. Getting this
 *    backwards would let a test pass while production reads `null`.
 *
 * WHAT IT DOES **NOT** MODEL — a green suite here is NOT a promise the write
 * succeeds against real Supabase:
 *  - no unique-index enforcement (the partial index on active overrides)
 *  - no RLS, no policies, no FK constraints, no CHECK constraints
 *  - no Postgres collation / NFC-vs-NFD equality semantics
 *  - no PostgREST 1000-row cap unless you seed >1000 rows deliberately
 *  - no concurrency: two "simultaneous" requests are just two sequential calls
 * Those belong to the database and are covered by docs/QA_PARAM_MAPPING.md.
 */

export type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
type Filter = [string, string, unknown];

export interface RecordedOp {
  table: string;
  op: Op;
  /** Rows/patch handed to insert/update/upsert. Null for select/delete. */
  payload: Row | Row[] | null;
  /** Ordered filter calls, e.g. [['eq','id','ov-1'], ['eq','is_active', true]] */
  filters: Filter[];
  /** True when .select() was chained (⇒ the caller gets a representation). */
  selected: boolean;
  /** Rows this op actually matched/produced. */
  result: Row[];
}

export interface MockSpec {
  /** Seed rows per table. A table absent here throws when touched. */
  tables?: Record<string, Row[]>;
  /** rpc(name) → rows. */
  rpc?: Record<string, unknown>;
  /**
   * Inject a failure: { atlas_dictionary_overrides: { insert: { message: '…' } } }
   * `afterCalls: N` lets the first N matching calls succeed and fails the rest,
   * which is the only way to reach a branch where a route's SECOND write to a
   * table fails (e.g. a compensating rollback after a failed log append).
   */
  fail?: Record<string, Partial<Record<Op, { message: string; code?: string; afterCalls?: number }>>>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Filter semantics, narrow on purpose — only what the routes actually use. */
function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([kind, col, val]) => {
    const cell = row[col];
    switch (kind) {
      case 'eq':
        return cell === val;
      case 'neq':
        return cell !== val;
      case 'in':
        return Array.isArray(val) && (val as unknown[]).includes(cell);
      case 'gte':
        return String(cell) >= String(val);
      case 'lte':
        return String(cell) <= String(val);
      case 'is':
        return val === null ? cell === null || cell === undefined : cell === val;
      case 'not':
        // Only `.not(col, 'is', null)` is used in these routes.
        return cell !== null && cell !== undefined;
      case 'ilike': {
        // Translate the LIKE pattern, honouring backslash escapes — the search
        // path escapes \ % and _ and a mock that ignored that would hide the
        // very bug the escaping fixes.
        const pat = String(val);
        let re = '';
        for (let i = 0; i < pat.length; i++) {
          const ch = pat[i];
          if (ch === '\\') {
            const next = pat[++i];
            re += next === undefined ? '\\\\' : next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          } else if (ch === '%') re += '.*';
          else if (ch === '_') re += '.';
          else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        return new RegExp(`^${re}$`, 'i').test(String(cell ?? ''));
      }
      // order/range/limit are not row predicates.
      default:
        return true;
    }
  });
}

export function createSupabaseMock(spec: MockSpec = {}) {
  const tables: Record<string, Row[]> = clone(spec.tables ?? {});
  const ops: RecordedOp[] = [];
  let idCounter = 0;

  /**
   * `afterCalls: N` fails only from the (N+1)th matching call onward, leaving
   * the first N to succeed. Without it a route that writes the same table twice
   * — deactivate, then a compensating restore — cannot have its SECOND write
   * fail, so the divergent-state branch is unreachable and any test for it
   * silently exercises the first failure instead.
   */
  const opCallCounts = new Map<string, number>();
  const failFor = (table: string, op: Op) => {
    const injected = spec.fail?.[table]?.[op];
    if (!injected) return undefined;
    const key = `${table}:${op}`;
    const seen = opCallCounts.get(key) ?? 0;
    opCallCounts.set(key, seen + 1);
    const after = (injected as { afterCalls?: number }).afterCalls ?? 0;
    return seen >= after ? injected : undefined;
  };

  function build(table: string) {
    if (!(table in tables)) {
      // Loud, matching the convention in atlasFamilyCardFacts.test.ts — an
      // unmocked table must fail rather than silently return undefined.
      throw new Error(`Unexpected table in mock: ${table}`);
    }

    let op: Op = 'select';
    let payload: Row | Row[] | null = null;
    let selected = false;
    let wantCount = false;
    const filters: Filter[] = [];
    const orderCols: Array<{ col: string; asc: boolean }> = [];
    let rangeSpec: { from: number; to: number } | null = null;

    const addFilter = (kind: string, col: string, val: unknown) => {
      filters.push([kind, col, val]);
      return chain;
    };

    /** Compute the rows this operation affects, mutating state for writes. */
    function execute(): { data: Row[] | null; error: { message: string; code?: string } | null; count: number | null } {
      const injected = failFor(table, op);
      if (injected) {
        ops.push({ table, op, payload, filters: [...filters], selected, result: [] });
        return { data: null, error: injected, count: null };
      }

      let result: Row[] = [];
      const rows = tables[table];

      if (op === 'select') {
        result = rows.filter((r) => matches(r, filters));
        if (orderCols.length) {
          result = [...result].sort((a, b) => {
            for (const { col, asc } of orderCols) {
              const av = String(a[col] ?? '');
              const bv = String(b[col] ?? '');
              if (av !== bv) return (av < bv ? -1 : 1) * (asc ? 1 : -1);
            }
            return 0;
          });
        }
        const total = result.length;
        if (rangeSpec) result = result.slice(rangeSpec.from, rangeSpec.to + 1);
        ops.push({ table, op, payload, filters: [...filters], selected, result: clone(result) });
        return { data: clone(result), error: null, count: wantCount ? total : null };
      }

      if (op === 'insert') {
        const incoming = Array.isArray(payload) ? payload : [payload as Row];
        result = incoming.map((r) => {
          const row: Row = { id: `row-${++idCounter}`, is_active: true, ...clone(r) };
          rows.push(row);
          return row;
        });
      } else if (op === 'upsert') {
        const incoming = Array.isArray(payload) ? payload : [payload as Row];
        result = incoming.map((r) => {
          // onConflict key is not modelled generically; match on any seeded
          // primary-ish column present in both.
          const key = ['param_name', 'id', 'mpn'].find((k) => k in (r as Row));
          const existing = key ? rows.find((x) => x[key] === (r as Row)[key]) : undefined;
          if (existing) {
            Object.assign(existing, clone(r));
            return existing;
          }
          const row: Row = { id: `row-${++idCounter}`, ...clone(r) };
          rows.push(row);
          return row;
        });
      } else if (op === 'update') {
        result = rows.filter((r) => matches(r, filters));
        for (const r of result) Object.assign(r, clone(payload as Row));
      } else if (op === 'delete') {
        result = rows.filter((r) => matches(r, filters));
        tables[table] = rows.filter((r) => !result.includes(r));
      }

      ops.push({ table, op, payload, filters: [...filters], selected, result: clone(result) });
      // THE FIDELITY POINT: no representation unless .select() was chained.
      return { data: selected ? clone(result) : null, error: null, count: null };
    }

    const chain = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === 'select') {
          // A bare .from(t).select(...) — this IS the read op.
          if (opts?.count) wantCount = true;
        } else {
          // .insert(...).select() / .update(...).select() — asks for a representation.
          selected = true;
        }
        if (op === 'select') selected = true;
        return chain;
      },
      insert(rows: Row | Row[]) {
        op = 'insert';
        payload = rows;
        return chain;
      },
      update(patch: Row) {
        op = 'update';
        payload = patch;
        return chain;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- onConflict is part of the real signature
      upsert(rows: Row | Row[], opts?: unknown) {
        op = 'upsert';
        payload = rows;
        return chain;
      },
      delete() {
        op = 'delete';
        return chain;
      },
      eq: (c: string, v: unknown) => addFilter('eq', c, v),
      neq: (c: string, v: unknown) => addFilter('neq', c, v),
      in: (c: string, v: unknown[]) => addFilter('in', c, v),
      gte: (c: string, v: unknown) => addFilter('gte', c, v),
      lte: (c: string, v: unknown) => addFilter('lte', c, v),
      is: (c: string, v: unknown) => addFilter('is', c, v),
      not: (c: string, _o: string, v: unknown) => addFilter('not', c, v),
      ilike: (c: string, v: unknown) => addFilter('ilike', c, v),
      order(col: string, o?: { ascending?: boolean }) {
        orderCols.push({ col, asc: o?.ascending !== false });
        return chain;
      },
      limit(n: number) {
        rangeSpec = { from: 0, to: n - 1 };
        return chain;
      },
      range(from: number, to: number) {
        rangeSpec = { from, to };
        return chain;
      },
      single() {
        const res = execute();
        const rows = res.data ?? [];
        if (res.error) return Promise.resolve(res);
        if (rows.length === 0) {
          return Promise.resolve({
            data: null,
            error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
            count: null,
          });
        }
        return Promise.resolve({ data: rows[0], error: null, count: null });
      },
      maybeSingle() {
        const res = execute();
        if (res.error) return Promise.resolve(res);
        return Promise.resolve({ data: (res.data ?? [])[0] ?? null, error: null, count: null });
      },
      // Thenable: `await supabase.from(t).update(x).eq(...)` with no .select().
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(execute()).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      },
    };

    return chain;
  }

  const client = {
    from: (table: string) => build(table),
    rpc: (name: string) => {
      const data = spec.rpc?.[name];
      if (data === undefined) throw new Error(`Unexpected rpc in mock: ${name}`);
      return Promise.resolve({ data, error: null });
    },
  };

  return {
    client,
    /** Current rows in a table (post-mutation). */
    rows: (table: string): Row[] => clone(tables[table] ?? []),
    /** Every recorded operation, in call order. */
    ops: () => clone(ops),
    /** Recorded ops for one table+op. */
    writes: (table: string, op: Op) => ops.filter((o) => o.table === table && o.op === op).map(clone),
    /** Op sequence for a table — pins select→update→insert ordering. */
    opOrder: (table: string) => ops.filter((o) => o.table === table).map((o) => o.op),
    reset: () => {
      ops.length = 0;
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
