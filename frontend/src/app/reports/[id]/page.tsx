import { redirect } from 'next/navigation';

export default async function ReportDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/today/${id}`);
}
