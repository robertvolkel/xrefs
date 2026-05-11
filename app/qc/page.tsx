import { redirect } from 'next/navigation';

export default async function QcRedirect({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const params = await searchParams;
  const section = params.section === 'feedback' ? 'logic-feedback' : 'activity-logs';
  redirect(`/monitoring?section=${section}`);
}
