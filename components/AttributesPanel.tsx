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
import { HEADER_HEIGHT, HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, ROW_PY, ROW_PY_MOBILE } from '@/lib/layoutConstants';

interface AttributesPanelProps {
  attributes: PartAttributes | null;
  loading?: boolean;
  title: string;
}

export default function AttributesPanel({ attributes, loading, title }: AttributesPanelProps) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — fixed height to align with right panel */}
      <Box
        sx={{
          height: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          minHeight: { xs: HEADER_HEIGHT_MOBILE, md: HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
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
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                Parameter
              </TableCell>
              <TableCell sx={{ bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 600, borderColor: 'divider', color: 'text.secondary', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                Value
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
                      <Skeleton width={120} height={16} />
                    </TableCell>
                    <TableCell sx={{ borderColor: 'divider', py: { xs: ROW_PY_MOBILE, md: ROW_PY } }}>
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
                          fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                          borderColor: 'divider',
                          width: '50%',
                          py: { xs: ROW_PY_MOBILE, md: ROW_PY },
                        }}
                      >
                        {param.parameterName}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                          borderColor: 'divider',
                          py: { xs: ROW_PY_MOBILE, md: ROW_PY },
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
