import { Suspense } from 'react';
import PartsListShell from '@/components/parts-list/PartsListShell';

export default function PartsListPage() {
  return (
    <Suspense>
      <PartsListShell />
    </Suspense>
  );
}
