import { Children } from 'react';
import { compactAnswer, formatET, SHORT_DISCLAIMER, type Faq } from '@/lib/seo-public';
import { DISCLAIMER } from '@/lib/stock-seo-content';
export function SourceStamp({at,source}:{at?:string|null;source:string}) {return <p className="text-xs text-muted-foreground">数据更新：{formatET(at)} ET · 来源：{source}</p>;}
export function Answer({children,at}:{children:React.ReactNode;at?:string|null}) {return <><p className="answer text-base leading-8" data-updated={at||undefined}>{compactAnswer(Children.toArray(children).join(''))}</p><p className="text-sm text-muted-foreground">{SHORT_DISCLAIMER}</p></>;}
export function PublicFaq({items}:{items:Faq[]}) {return <section id="faq" className="space-y-5"><h2 className="text-xl font-medium">常见问题</h2>{items.map(item=><article key={item.q}><h3 className="font-medium">{item.q}</h3><p className="text-sm leading-7 text-muted-foreground">{item.a}</p></article>)}</section>;}
export function PublicDisclaimer({at}:{at?:string|null}) {return <p className="text-sm text-muted-foreground">{DISCLAIMER} 数据更新时间：{formatET(at)} ET。</p>;}
