'use client';

import { Box, Card, CardActionArea, CardContent, IconButton, Typography } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PartsListSummary } from '@/lib/partsListStorage';

interface ListCardProps {
  list: PartsListSummary;
  onClick: () => void;
  onDelete: () => void;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString();
}

export default function ListCard({ list, onClick, onDelete }: ListCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        bgcolor: 'background.default',
        borderColor: 'divider',
        borderRadius: 3,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}40`,
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 0 }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <DescriptionIcon
              sx={{ fontSize: 24, color: 'primary.main', mt: 0.25, opacity: 0.7 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 600,
                  mb: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {list.name}
              </Typography>

              {list.description && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mb: 0.75,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    lineHeight: 1.4,
                  }}
                >
                  {list.description}
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary">
                {list.totalRows} parts
                {' \u00B7 '}
                Updated {formatRelativeDate(list.updatedAt)}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>

      {/* Delete — reveal on hover (always visible on mobile) */}
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          sx={{
            color: 'text.secondary',
            opacity: { xs: 0.5, md: 0 },
            '.MuiCard-root:hover &': { opacity: 0.7 },
            '&:hover': { opacity: 1, color: 'error.main' },
            transition: 'opacity 0.2s ease, color 0.2s ease',
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>
    </Card>
  );
}
