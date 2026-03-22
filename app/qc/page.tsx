import { redirect } from 'next/navigation';

export default async function QcRedirect({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams;
  const section = params.section === 'logs' ? 'qc-logs' : 'qc-feedback';
  redirect(`/admin?section=${section}`);
}
