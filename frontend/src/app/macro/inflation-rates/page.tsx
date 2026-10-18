import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/hooks/queries/query-client';
import { queryKeys } from '@/hooks/queries/query-keys';
import Dashboard from './Dashboard';
export const dynamic='force-dynamic';
export default async function Page(){const client=getQueryClient();await client.prefetchQuery({queryKey:queryKeys.macro.inflationRates(),queryFn:async()=>{const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api'}/macro-risk/inflation-rates`,{next:{revalidate:600},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Macro source unavailable');return response.json();}});return <HydrationBoundary state={dehydrate(client)}><Dashboard/></HydrationBoundary>;}
