'use client';
import Link from 'next/link';
import { useEntitlements } from '@/contexts/EntitlementsContext';
export function KolPaidArea({children}:{children:React.ReactNode}){const {has}=useEntitlements();return has('stock_research')?children:<div className="mx-auto max-w-5xl px-4 py-8"><h2 className="text-xl">完整博主研究资料</h2><p>Max 用户可查看完整观点、产业链资料与来源证据。</p><Link href="/pricing">查看 Max 权益</Link></div>;}
