import { redirect } from 'next/navigation';

function encodeSearchParams(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

// Keep `/kol/serenity/*` as a friendly alias for the canonical backend username.
export default async function SerenityAliasSubpathPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const query = encodeSearchParams(await searchParams);
  redirect(`/kol/aleabitoreddit/${path.join('/')}${query}`);
}
