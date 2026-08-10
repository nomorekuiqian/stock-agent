export interface NavChild {
  href: string;
  label: string;
  locked?: boolean;
  exact?: boolean;
}

export interface NavSection {
  href: string;
  label: string;
  highlight?: boolean;
  tourTarget?: string;
  children?: NavChild[];
}

interface MainNavOptions {
  forYouV2: boolean;
  watchlistExtended: boolean;
  isAdmin: boolean;
}

export function getMainNavSections({
  forYouV2,
  watchlistExtended,
  isAdmin,
}: MainNavOptions): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'AI 研究助手',
      href: '/research',
      highlight: true,
      tourTarget: 'nav-research-agent',
    },
    {
      label: '每日简报',
      href: '/today',
      tourTarget: 'nav-daily-reports',
      children: [
        { href: '/morning', label: '盘前早报' },
        { href: '/today', label: '盘后晚报' },
        { href: '/twitter-digest', label: 'KOL 日报' },
      ],
    },
    {
      label: '投研',
      href: '/stock',
      tourTarget: 'nav-research-system',
      children: [
        { href: '/kol', label: '博主研究室' },
        { href: '/stock', label: '个股研究' },
        { href: '/macro', label: '宏观研究' },
      ],
    },
    {
      label: '我的',
      href: '/for-you',
      tourTarget: 'nav-my',
      children: forYouV2
        ? [
            { href: '/for-you', label: '专属日报', exact: true },
            { href: '/for-you/onboarding', label: '投资画像' },
            { href: '/for-you/watchlist', label: '关注列表' },
            {
              href: '/for-you/portfolio',
              label: '模拟持仓',
              locked: !watchlistExtended,
            },
            {
              href: '/for-you/health',
              label: '持仓体检',
              locked: !watchlistExtended,
            },
          ]
        : [
            { href: '/for-you', label: '专属日报', exact: true },
            { href: '/for-you/watchlist', label: '我的自选股' },
          ],
    },
    {
      label: '定价',
      href: '/pricing',
    },
  ];

  if (isAdmin) {
    sections.push({
      label: '管理',
      href: '/admin',
      children: [
        { href: '/admin', label: '用户管理' },
        { href: '/admin/activity', label: '活跃对比' },
        { href: '/admin/flags', label: '灰度管理' },
        { href: '/admin/panda', label: 'Panda 授权' },
        { href: '/admin/llm-usage', label: 'LLM 用量' },
        { href: '/admin/feedback', label: '用户反馈' },
        { href: '/email-test', label: '邮件预览' },
      ],
    });
  }

  return sections;
}

export function isNavHrefActive(pathname: string, href: string, exact = false): boolean {
  if (href === '/') {
    return pathname === '/';
  }

  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
