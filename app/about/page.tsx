import { Box, Container, Typography } from '@mui/material';

export default function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        About XQ
      </Typography>
      <Box sx={{ color: 'text.secondary', mt: 2 }}>
        <Typography variant="body1">
          Content coming soon.
        </Typography>
      </Box>
    </Container>
  );
}
