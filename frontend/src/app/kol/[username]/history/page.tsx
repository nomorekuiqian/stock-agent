import { redirect } from 'next/navigation';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/kol/${username}/highlights?topic=market-rules`);
}
