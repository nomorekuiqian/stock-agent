import { redirect } from 'next/navigation';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function encodeSearchParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, item);
      }
    } else if (typeof value === 'string') {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export default async function FrankAgentLegacyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(`/kol/qinbafrank${encodeSearchParams(await searchParams)}`);
}
