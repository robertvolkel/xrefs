'use client';

import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';

interface ColumnLite {
  id: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

interface PaginatedTableSkeletonProps {
  columns: ColumnLite[];
  rows?: number;
}

/**
 * Shared loading skeleton for admin paginated-table tabs
 * (QcLogs, QcFeedback, DistributorClicks, AppFeedback, etc.).
 * Accepts the host panel's existing `columns` array so the header
 * column count + alignment match exactly.
 */
export default function PaginatedTableSkeleton({
  columns,
  rows = 10,
}: PaginatedTableSkeletonProps) {
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {columns.map((col) => (
            <TableCell
              key={col.id}
              align={col.align ?? 'left'}
              sx={{
                bgcolor: 'background.paper',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'text.secondary',
              }}
            >
              <Skeleton
                variant="text"
                width={Math.max(40, (col.label?.length ?? 8) * 7)}
                height={16}
                sx={{ ml: col.align === 'right' ? 'auto' : undefined, mx: col.align === 'center' ? 'auto' : undefined }}
              />
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {columns.map((col, c) => {
              const narrow = col.align === 'right' || col.align === 'center';
              const width = narrow ? 40 : c === 0 ? 110 : c === 1 ? 140 : 90;
              return (
                <TableCell key={col.id} align={col.align ?? 'left'}>
                  <Skeleton
                    variant="text"
                    width={width}
                    sx={{
                      ml: col.align === 'right' ? 'auto' : undefined,
                      mx: col.align === 'center' ? 'auto' : undefined,
                    }}
                  />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
