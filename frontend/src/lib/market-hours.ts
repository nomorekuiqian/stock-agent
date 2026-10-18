import calendar from './nyse-calendar.json';
export const MARKET_ZONES = [['北京','Asia/Shanghai'],['台北','Asia/Taipei'],['香港','Asia/Hong_Kong'],['新加坡','Asia/Singapore'],['温哥华','America/Vancouver'],['多伦多','America/Toronto'],['纽约','America/New_York'],['洛杉矶','America/Los_Angeles']] as const;
export function marketSession(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map(p => [p.type,p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const data = calendar.years[parts.year as keyof typeof calendar.years];
  if (!data) return { date, label: '当年官方日历尚未更新', open: false, known: false };
  const holiday = data.holidays.find(h => h.date === date);
  if (holiday || ['Sat','Sun'].includes(parts.weekday)) return { date, label: holiday ? `休市：${holiday.name}` : '周末休市', open: false, known: true };
  const minutes = Number(parts.hour)*60+Number(parts.minute);
  const early = data.early_closes.some(h => h.date === date);
  const close = early ? 780 : 960;
  const label = minutes >= 570 && minutes < close ? '常规交易中' : minutes >= 240 && minutes < 570 ? '盘前时段（依交易所与券商）' : minutes >= close && minutes < (early ? 1020 : 1200) ? '盘后时段（依交易所与券商）' : '已收盘';
  return { date, label, open: minutes >= 570 && minutes < close, known: true };
}
export function sessionTimes(season: 'summer' | 'winter', zone: string) {
  // Representative dates only for UTC-offset conversion; holidays use the imported official dataset.
  const day = season === 'summer' ? '2026-07-15' : '2026-01-15';
  const offset = season === 'summer' ? '-04:00' : '-05:00';
  const format = (time: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`${day}T${time}:00${offset}`));
  return ['04:00','09:30','16:00','20:00'].map(format);
}

export function nextTradingDay(now: Date) {
 const today=marketSession(now);
 const start=new Date(`${today.date}T12:00:00Z`);
 for(let offset=0;offset<15;offset++) {
  const candidate=new Date(start.getTime()+offset*86400000);
  const session=marketSession(candidate);
  if(!session.known)return null;
  if(!/休市/.test(session.label)&&(offset>0||Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now))<(calendar.years[today.date.slice(0,4) as keyof typeof calendar.years]?.early_closes.some(r=>r.date===today.date)?13:16)))return session.date;
 }
 return null;
}
export function daylightTransitions(year:number) {
 const nthSunday=(month:number,n:number)=>{const day=new Date(Date.UTC(year,month-1,1));return 1+(7-day.getUTCDay())%7+(n-1)*7;};
 return {start:`${year}-03-${String(nthSunday(3,2)).padStart(2,'0')}`,end:`${year}-11-${String(nthSunday(11,1)).padStart(2,'0')}`};
}
