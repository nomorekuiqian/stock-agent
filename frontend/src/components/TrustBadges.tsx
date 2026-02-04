'use client';

/**
 * TrustBadges - Data source trust indicators
 * Displays logos of financial data providers in a unified, minimal style
 */

// Simplified, stylized icons for data sources
// Using abstract representations to avoid trademark issues while maintaining recognition

const DataSourceLogos = {
  // Reuters - Stylized "R" with dot (represents their iconic orange dot branding)
  Reuters: () => (
    <svg viewBox="0 0 80 32" fill="currentColor" className="h-5 w-auto">
      <circle cx="6" cy="16" r="4" className="fill-[#FF8000]" />
      <text x="16" y="23" className="text-[20px] font-semibold fill-current" style={{ fontFamily: 'system-ui' }}>
        Reuters
      </text>
    </svg>
  ),

  // Bloomberg - Stylized wordmark
  Bloomberg: () => (
    <svg viewBox="0 0 100 32" fill="currentColor" className="h-5 w-auto">
      <text x="0" y="23" className="text-[20px] font-bold fill-current" style={{ fontFamily: 'system-ui' }}>
        Bloomberg
      </text>
    </svg>
  ),

  // SEC - Shield icon with "SEC" text
  SEC: () => (
    <svg viewBox="0 0 60 32" fill="currentColor" className="h-5 w-auto">
      <path
        d="M16 4 L28 4 L30 8 L30 24 L28 28 L16 28 L14 24 L14 8 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="opacity-60"
      />
      <text x="17" y="20" className="text-[10px] font-bold fill-current">
        SEC
      </text>
      <text x="34" y="23" className="text-[16px] font-medium fill-current opacity-80" style={{ fontFamily: 'system-ui' }}>
        Filings
      </text>
    </svg>
  ),

  // Yahoo Finance - Y! icon with chart
  YahooFinance: () => (
    <svg viewBox="0 0 90 32" fill="currentColor" className="h-5 w-auto">
      <text x="0" y="24" className="text-[22px] font-bold" style={{ fontFamily: 'system-ui' }}>
        Y!
      </text>
      <text x="24" y="23" className="text-[16px] font-medium fill-current opacity-80" style={{ fontFamily: 'system-ui' }}>
        Finance
      </text>
    </svg>
  ),
};

// Alternative: Simple text-based badges with subtle styling
const SimpleDataBadge = ({ name }: { name: string }) => (
  <div className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-muted-foreground transition-colors">
    <div className="w-1 h-1 rounded-full bg-primary/50" />
    <span className="text-xs font-medium tracking-wide">{name}</span>
  </div>
);

interface TrustBadgesProps {
  variant?: 'logos' | 'simple' | 'minimal';
  showUserCount?: boolean;
  userCount?: string;
  className?: string;
}

export default function TrustBadges({
  variant = 'minimal',
  showUserCount = true,
  userCount = '100+',
  className = '',
}: TrustBadgesProps) {
  const dataSources = ['Reuters', 'Bloomberg', 'SEC Filings', 'Yahoo Finance'];

  if (variant === 'minimal') {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        {/* Data Sources */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Data from</span>
          <div className="flex items-center gap-3">
            {dataSources.map((source, i) => (
              <span key={source} className="text-xs text-muted-foreground/60 font-medium">
                {source}
                {i < dataSources.length - 1 && <span className="ml-3 text-muted-foreground/30">|</span>}
              </span>
            ))}
          </div>
        </div>

        {/* User Count */}
        {showUserCount && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-background flex items-center justify-center"
                >
                  <span className="text-[8px] text-primary/70 font-medium">
                    {['K', 'J', 'M'][i]}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              已为 <span className="text-foreground font-medium">{userCount}</span> 投资者提供服务
            </span>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'simple') {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Data Sources Row */}
        <div className="flex items-center gap-6">
          {dataSources.map((source) => (
            <SimpleDataBadge key={source} name={source} />
          ))}
        </div>

        {/* Stats Row */}
        {showUserCount && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>已为 <span className="text-foreground font-medium">{userCount}</span> 投资者提供服务</span>
          </div>
        )}
      </div>
    );
  }

  // Logo variant with SVG logos
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Logos Row */}
      <div className="flex items-center gap-6 text-muted-foreground/60">
        <span className="text-[10px] uppercase tracking-wider opacity-50">Data from</span>
        <DataSourceLogos.Reuters />
        <DataSourceLogos.Bloomberg />
        <DataSourceLogos.SEC />
        <DataSourceLogos.YahooFinance />
      </div>

      {/* User Count */}
      {showUserCount && (
        <p className="text-sm text-muted-foreground">
          已为 <span className="text-foreground font-medium">{userCount}</span> 投资者提供服务
        </p>
      )}
    </div>
  );
}

// Export individual components for flexibility
export { DataSourceLogos, SimpleDataBadge };
