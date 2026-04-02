'use client';

import { use } from 'react';
import ManufacturerDetailPage from '@/components/admin/ManufacturerDetailPage';

export default function ManufacturerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <ManufacturerDetailPage slug={slug} />;
}
