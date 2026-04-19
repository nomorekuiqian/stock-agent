'use client';

import { useMemo } from 'react';
import ChatInput from './ChatInput';

// ---------------------------------------------------------------------------
// Greeting rotation
// ---------------------------------------------------------------------------

const GREETINGS = [
  { main: '今天市场有什么动静？', sub: '让 AI 帮你快速了解' },
  { main: '你关注的股票还好吗？', sub: '查行情、看分析、找机会' },
  { main: '不确定该买什么？', sub: '让 AI 帮你筛选和分析' },
  { main: '想知道大盘在发生什么？', sub: '宏观、情绪、流动性，一问就懂' },
  { main: '错过了什么重要消息？', sub: '日报、早报、周报，随时追' },
];

// ---------------------------------------------------------------------------
// Question pool — 3 large-cap + 3 small-cap + 2 market, shuffled each session
// ---------------------------------------------------------------------------

const LARGE_CAP_QUESTIONS = [
  '特斯拉还能买吗',
  '英伟达现在什么情况',
  '苹果值得入手吗',
  '亚马逊还能涨吗',
  'META 现在贵不贵',
  '谷歌值得长期持有吗',
  '微软还有上涨空间吗',
];

const SMALL_CAP_QUESTIONS = [
  'PLTR 能不能追',
  'AMD 现在能买吗',
  'SOFI 值得关注吗',
  'COIN 还能上车吗',
  'NIO 还有戏吗',
  'SMCI 现在能抄底吗',
  'ARM 还值得买吗',
];

const MARKET_QUESTIONS = [
  '今天大盘怎么样',
  '现在是买入时机吗',
  '最近有什么值得关注的股票',
  '现在适合抄底吗',
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuotaInfo {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

interface WelcomeScreenProps {
  onSelect: (value: string) => void;
  universeSize?: number;
  userName?: string | null;
  quota?: QuotaInfo | null;
}

export default function WelcomeScreen({
  onSelect,
  universeSize,
  userName,
  quota,
}: WelcomeScreenProps) {
  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [],
  );

  const questions = useMemo(() => {
    const large = pickRandom(LARGE_CAP_QUESTIONS, 3);
    const small = pickRandom(SMALL_CAP_QUESTIONS, 3);
    const market = pickRandom(MARKET_QUESTIONS, 2);
    return [...large, ...small, ...market].sort(() => Math.random() - 0.5);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 sm:px-5 py-8 sm:py-12 min-h-full">

          {/* -- Logo + Greeting -- */}
          <div className="mb-8 sm:mb-12 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
                    stroke="url(#welcome-brand)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="welcome-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#6EE7B7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <p className="text-lg font-editorial text-foreground">
                Hi{userName ? `，${userName}` : ''}
              </p>
            </div>
            <h1 className="font-editorial text-2xl sm:text-4xl md:text-5xl leading-[1.2] text-foreground tracking-tight mb-3">
              {greeting.main}
            </h1>
            <p className="text-sm text-muted-foreground">
              {greeting.sub}
              {universeSize ? ` · ${universeSize.toLocaleString()} 只美股实时数据` : ''}
            </p>
          </div>

          {/* -- Question pills -- */}
          <div className="flex flex-wrap gap-2.5">
            {questions.map((q, i) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelect(q)}
                className="px-4 py-2.5 rounded-full border border-border/50 hover:border-primary/30 hover:bg-primary/[0.04] text-sm text-foreground/90 hover:text-foreground transition-all duration-150 cursor-pointer animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {q}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* -- Composer -- */}
      <div className="shrink-0 mx-auto w-full max-w-2xl px-4 sm:px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:pt-4">
        <ChatInput
          onSubmit={onSelect}
          placeholder="随便问点什么..."
          autoFocus={false}
          quota={quota}
        />
      </div>
    </div>
  );
}
