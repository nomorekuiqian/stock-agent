'use client';
import { useEffect, useState } from 'react';
import { marketSession } from '@/lib/market-hours';
export function MarketStatus({ initial }: { initial: string }) {
  const [now,setNow]=useState(initial);
  useEffect(()=>{const id=setInterval(()=>setNow(new Date().toISOString()),60000);return()=>clearInterval(id);},[]);
  const session=marketSession(new Date(now));
  return <section className="terminal-card p-6 space-y-2"><h2 className="text-xl font-medium">美股现在开盘了吗？</h2><p className={session.open?'text-emerald-500':'text-muted-foreground'}>{session.label}</p><p className="text-xs">纽约交易日 {session.date} · 每分钟刷新</p></section>;
}
