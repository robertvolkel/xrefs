import { getAllContextConfigs } from '@/lib/contextQuestions/index';
import enLocale from '@/locales/en.json';
import deLocale from '@/locales/de.json';
import zhLocale from '@/locales/zh-CN.json';

/**
 * Guard tests for the context-question translation layer (`locales/*.json`).
 *
 * Background (the bug these tests prevent):
 * The application context questions are authored in TypeScript
 * (`lib/contextQuestions/*.ts`) — that is the SINGLE SOURCE OF TRUTH for the
 * matching logic. The UI renders the question *title* and option *labels* from
 * the i18n locale files via key `contextQ.<familyId>.<questionId>.text`, falling
 * back to the TS source only when the key is absent
 * (see `components/ApplicationContextForm.tsx`).
 *
 * A broken translation-extraction step once (a) pasted the automotive question's
 * text into the FIRST question of several families (so the operating-mode question
 * for BJTs rendered as "Is this an automotive application?" — making it look like
 * the automotive question was asked twice), and (b) truncated strings at
 * apostrophes, leaving dangling backslashes ("Low Q / don\\"). None of this
 * affected scoring — the engine keys off questionId + answer values, never the
 * display text — but it silently misrepresented questions to users.
 *
 * These tests make that class of error fail CI instead of shipping:
 *  1. `en` (the source language) must match the TS source byte-for-byte for every
 *     present text / option label / option description.
 *  2. No two questions within a family may share an identical title, and no two
 *     options within a question may share an identical label (copy-paste detector
 *     that works for the translated locales too, where (1) cannot apply).
 *  3. No locale string may be corrupt (empty, or ending in a stray backslash from
 *     a truncated escape).
 */

type LocaleNode = {
  text?: string;
  opt?: Record<string, { label?: string; desc?: string }>;
};
type LocaleContextQ = Record<string, Record<string, LocaleNode>>;

const LOCALES: Record<string, LocaleContextQ> = {
  en: (enLocale as { contextQ?: LocaleContextQ }).contextQ ?? {},
  de: (deLocale as { contextQ?: LocaleContextQ }).contextQ ?? {},
  'zh-CN': (zhLocale as { contextQ?: LocaleContextQ }).contextQ ?? {},
};

// Authoritative source of truth, flattened from the TS context configs.
interface TsOption { value: string; label: string; description?: string }
interface TsQuestion { familyId: string; questionId: string; text: string; options: TsOption[] }

const TS_QUESTIONS: TsQuestion[] = [];
for (const cfg of getAllContextConfigs()) {
  for (const familyId of cfg.familyIds) {
    for (const q of cfg.questions) {
      TS_QUESTIONS.push({
        familyId,
        questionId: q.questionId,
        text: q.questionText,
        options: q.options.map((o) => ({ value: o.value, label: o.label, description: o.description })),
      });
    }
  }
}

const isCorrupt = (v: string) => v.trim() === '' || v.endsWith('\\');

describe('context question translations — en matches TS source of truth', () => {
  // `en` is the source language: every locale string that exists MUST be
  // byte-identical to the TypeScript definition. Any difference is a bug — either
  // a copy-paste, a truncation, or stale drift.
  it.each(TS_QUESTIONS)('en text exact for $familyId.$questionId', (q) => {
    const t = LOCALES.en[q.familyId]?.[q.questionId]?.text;
    if (t !== undefined) {
      expect(`${q.familyId}.${q.questionId}: ${t}`).toBe(`${q.familyId}.${q.questionId}: ${q.text}`);
    }
  });

  it('en option labels and descriptions exact vs TS', () => {
    const mismatches: string[] = [];
    for (const q of TS_QUESTIONS) {
      const node = LOCALES.en[q.familyId]?.[q.questionId];
      if (!node?.opt) continue;
      for (const o of q.options) {
        const ent = node.opt[o.value];
        if (!ent) continue;
        if (ent.label !== undefined && ent.label !== o.label) {
          mismatches.push(`${q.familyId}.${q.questionId}.${o.value}.label: "${ent.label}" !== "${o.label}"`);
        }
        if (o.description !== undefined && ent.desc !== undefined && ent.desc !== o.description) {
          mismatches.push(`${q.familyId}.${q.questionId}.${o.value}.desc drift`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('context question translations — no copy-paste duplicates', () => {
  // A family asking two questions with the SAME title (or a question offering two
  // options with the SAME label) is the signature of a copy-paste error. This is
  // the only check that works for the translated locales (de / zh-CN), where we
  // cannot compare against the English source.
  for (const [loc, cq] of Object.entries(LOCALES)) {
    it(`${loc}: question titles are unique within each family`, () => {
      const dups: string[] = [];
      for (const [fam, questions] of Object.entries(cq)) {
        const seen = new Map<string, string>();
        for (const [qid, node] of Object.entries(questions)) {
          const t = node?.text;
          if (typeof t !== 'string') continue;
          if (seen.has(t)) dups.push(`${fam}: "${qid}" duplicates "${seen.get(t)}" => ${JSON.stringify(t)}`);
          else seen.set(t, qid);
        }
      }
      expect(dups).toEqual([]);
    });

    it(`${loc}: option labels are unique within each question`, () => {
      const dups: string[] = [];
      for (const [fam, questions] of Object.entries(cq)) {
        for (const [qid, node] of Object.entries(questions)) {
          const opt = node?.opt;
          if (!opt) continue;
          const seen = new Map<string, string>();
          for (const [val, ent] of Object.entries(opt)) {
            const l = ent?.label;
            if (typeof l !== 'string') continue;
            if (seen.has(l)) dups.push(`${fam}.${qid}: "${val}" duplicates "${seen.get(l)}" => ${JSON.stringify(l)}`);
            else seen.set(l, val);
          }
        }
      }
      expect(dups).toEqual([]);
    });
  }
});

describe('context question translations — no corrupt strings', () => {
  // Catches truncation artifacts (e.g. strings cut at an apostrophe leaving a
  // dangling escape: "Low Q / don\\") and empty values, in every locale.
  for (const [loc, cq] of Object.entries(LOCALES)) {
    it(`${loc}: no empty or backslash-truncated strings`, () => {
      const bad: string[] = [];
      for (const [fam, questions] of Object.entries(cq)) {
        for (const [qid, node] of Object.entries(questions)) {
          if (typeof node?.text === 'string' && isCorrupt(node.text)) {
            bad.push(`${fam}.${qid}.text => ${JSON.stringify(node.text)}`);
          }
          for (const [val, ent] of Object.entries(node?.opt ?? {})) {
            if (typeof ent?.label === 'string' && isCorrupt(ent.label)) {
              bad.push(`${fam}.${qid}.opt.${val}.label => ${JSON.stringify(ent.label)}`);
            }
            if (typeof ent?.desc === 'string' && isCorrupt(ent.desc)) {
              bad.push(`${fam}.${qid}.opt.${val}.desc => ${JSON.stringify(ent.desc)}`);
            }
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
