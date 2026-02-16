'use client';

import { Suspense } from 'react';
import { useSearchParams, redirect } from 'next/navigation';
import { peekPendingFile } from '@/lib/pendingFile';
import PartsListShell from '@/components/parts-list/PartsListShell';

function PartsListGate() {
  const searchParams = useSearchParams();

  // Redirect to /lists if accessed without a listId and no pending file upload
  if (!searchParams.get('listId') && !peekPendingFile()) {
    redirect('/lists');
  }

  return <PartsListShell />;
}

export default function PartsListPage() {
  return (
    <Suspense>
      <PartsListGate />
    </Suspense>
  );
}
