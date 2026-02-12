'use client';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  Stack,
} from '@mui/material';
import { PartAttributes } from '@/lib/types';

// Fixed header height so it aligns with ComparisonView header
const HEADER_HEIGHT = 100;
const ROW_FONT_SIZE = '0.78rem';
const ROW_PY = '10px';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
}

export default function AttributesPanel({ attributes, loading, title }: AttributesPanelProps) {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header — fixed height to align with right panel */}
      <Box
        sx={{
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {loading ? (
          <>
            <Skeleton width={80} height={16} sx={{ mb: 0.5 }} />
            <Skeleton width={200} height={22} />
            <Skeleton width={160} height={16} sx={{ mt: 0.5 }} />
          </>
        ) : attributes ? (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.3 }} noWrap>
                {attributes.part.mpn}
              </Typography>
              <Chip label={attributes.part.status} size="small" color={attributes.part.status === 'Active' ? 'success' : 'warning'} variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem', mt: 0.5 }} noWrap>
              {attributes.part.manufacturer}
            </Typography>
          </>
        ) : null}
      </Box>

      {/* Attributes table */}
      <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY }}>
                Parameter
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: ROW_PY }}>
                Value
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ borderColor: 'divider', py: ROW_PY }}>
                      <Skeleton width={120} height={16} />
                    </TableCell>
                    <TableCell sx={{ borderColor: 'divider', py: ROW_PY }}>
                      <Skeleton width={80} height={16} />
                    </TableCell>
                  </TableRow>
                ))
              : attributes?.parameters
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((param) => (
                    <TableRow key={param.parameterId} hover>
                      <TableCell
                        sx={{
                          color: 'text.secondary',
                          fontSize: ROW_FONT_SIZE,
                          borderColor: 'divider',
                          width: '50%',
                          py: ROW_PY,
                        }}
                      >
                        {param.parameterName}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: ROW_FONT_SIZE,
                          borderColor: 'divider',
                          py: ROW_PY,
                        }}
                      >
                        {param.value}
                      </TableCell>
                    </TableRow>
                  ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
