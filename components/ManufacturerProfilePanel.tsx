'use client';
import {
  Box,
  Typography,
  IconButton,
  Stack,
  Chip,
  Divider,
  Avatar,
  Skeleton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FactoryIcon from '@mui/icons-material/Factory';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import BuildIcon from '@mui/icons-material/Build';
import { ManufacturerProfile } from '@/lib/types';
import { ATTRIBUTES_HEADER_HEIGHT, ATTRIBUTES_HEADER_HEIGHT_MOBILE, ROW_FONT_SIZE, ROW_FONT_SIZE_MOBILE, SECTION_PY } from '@/lib/layoutConstants';

function getCertColor(category: string): string {
  switch (category) {
    case 'automotive': return '#42A5F5';
    case 'quality': return '#66BB6A';
    case 'environmental': return '#26A69A';
    case 'safety': return '#FFA726';
    case 'military': return '#EF5350';
    default: return '#90A4AE';
  }
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(w => w.length > 0 && w[0] === w[0].toUpperCase())
    .slice(0, 2)
    .map(w => w[0])
    .join('');
}

function getLocationIcon(type: string) {
  switch (type) {
    case 'fab': return <FactoryIcon sx={{ fontSize: 14, color: 'text.secondary' }} />;
    case 'assembly_test': return <BuildIcon sx={{ fontSize: 14, color: 'text.secondary' }} />;
    case 'both': return <PrecisionManufacturingIcon sx={{ fontSize: 14, color: 'text.secondary' }} />;
    default: return null;
  }
}

function getLocationLabel(type: string): string {
  switch (type) {
    case 'fab': return 'Fabrication';
    case 'assembly_test': return 'Assembly & Test';
    case 'both': return 'Fab + Assembly';
    default: return type;
  }
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ fontSize: '0.65rem', letterSpacing: '0.08em', mb: 1, display: 'block' }}
    >
      {children}
    </Typography>
  );
}

interface ManufacturerProfilePanelProps {
  profile: ManufacturerProfile;
  onClose: () => void;
  source?: 'atlas' | 'mock' | 'unknown';
  loading?: boolean;
}

export default function ManufacturerProfilePanel({ profile, onClose, source = 'unknown', loading = false }: ManufacturerProfilePanelProps) {
  const hasAnyContent =
    !!profile.summary ||
    profile.productCategories.length > 0 ||
    profile.certifications.length > 0 ||
    profile.manufacturingLocations.length > 0 ||
    profile.authorizedDistributors.length > 0 ||
    profile.complianceFlags.length > 0 ||
    profile.designResources.length > 0;
  const showEmptyState = !loading && source !== 'mock' && !hasAnyContent;
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — aligned with AttributesPanel / RecommendationsPanel divider */}
      <Box
        sx={{
          height: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          minHeight: { xs: ATTRIBUTES_HEADER_HEIGHT_MOBILE, md: ATTRIBUTES_HEADER_HEIGHT },
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Avatar
          src={profile.logoUrl}
          sx={{
            width: { xs: 48, md: 40 },
            height: { xs: 48, md: 40 },
            bgcolor: 'primary.main',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          {getInitials(profile.name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" sx={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.3 }} noWrap>
              {profile.name}
            </Typography>
            {source === 'mock' && (
              <Chip label="Sample Data" size="small" variant="outlined" color="warning" sx={{ fontSize: '0.6rem', height: 18 }} />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }} noWrap>
            {profile.countryFlag} {profile.headquarters}
            {profile.foundedYear && ` · Est. ${profile.foundedYear}`}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Scrollable body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>
        {loading && (
          <Box sx={{ mb: SECTION_PY }}>
            <Skeleton variant="text" width="40%" sx={{ mb: 1 }} />
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="text" width="70%" />
            <Stack direction="row" spacing={0.75} sx={{ mt: 2 }}>
              <Skeleton variant="rounded" width={80} height={22} />
              <Skeleton variant="rounded" width={64} height={22} />
              <Skeleton variant="rounded" width={96} height={22} />
            </Stack>
          </Box>
        )}

        {showEmptyState && (
          <Box sx={{ mb: SECTION_PY }}>
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, lineHeight: 1.7 }}>
              Detailed profile not available yet for this manufacturer.
            </Typography>
          </Box>
        )}

        {/* About */}
        {!loading && profile.summary && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>About</SectionHeader>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE }, lineHeight: 1.7 }}>
              {profile.summary}
            </Typography>
          </Box>
        )}

        {/* Product Categories */}
        {profile.productCategories.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Product Categories</SectionHeader>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {profile.productCategories.map((cat) => (
                <Chip
                  key={cat}
                  label={cat}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: { xs: '0.75rem', md: '0.68rem' }, height: { xs: 28, md: 22 } }}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Divider sx={{ mb: SECTION_PY }} />

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Certifications</SectionHeader>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {profile.certifications.map((cert) => (
                <Chip
                  key={cert.name}
                  label={cert.name}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: { xs: '0.75rem', md: '0.68rem' },
                    height: { xs: 28, md: 22 },
                    color: getCertColor(cert.category),
                    borderColor: getCertColor(cert.category),
                  }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {/* Manufacturing Locations */}
        {profile.manufacturingLocations.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Manufacturing Locations</SectionHeader>
            <Stack spacing={0.75}>
              {profile.manufacturingLocations.map((loc) => (
                <Stack key={loc.location} direction="row" alignItems="center" spacing={1}>
                  {getLocationIcon(loc.type)}
                  <Typography variant="body2" sx={{ fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE } }}>
                    {loc.location}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {getLocationLabel(loc.type)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {/* Authorized Distributors */}
        {profile.authorizedDistributors.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Authorized Distributors</SectionHeader>
            <Stack spacing={0.5}>
              {profile.authorizedDistributors.map((dist) => (
                <Typography
                  key={dist.name}
                  component="a"
                  href={dist.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: { xs: ROW_FONT_SIZE_MOBILE, md: ROW_FONT_SIZE },
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                    display: 'block',
                  }}
                >
                  {dist.name}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}

        {/* Compliance Flags */}
        {profile.complianceFlags.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Compliance</SectionHeader>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {profile.complianceFlags.map((flag) => (
                <Chip
                  key={flag}
                  label={flag}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: { xs: '0.75rem', md: '0.68rem' }, height: { xs: 28, md: 22 } }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {/* Design Resources */}
        {profile.designResources.length > 0 && (
          <Box sx={{ mb: SECTION_PY }}>
            <SectionHeader>Design Resources</SectionHeader>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {profile.designResources.map((res) => (
                <Chip
                  key={res.type}
                  label={res.type}
                  size="small"
                  variant="filled"
                  sx={{ fontSize: { xs: '0.75rem', md: '0.68rem' }, height: { xs: 28, md: 22 }, bgcolor: 'action.selected' }}
                />
              ))}
            </Stack>
          </Box>
        )}

      </Box>
    </Box>
  );
}
