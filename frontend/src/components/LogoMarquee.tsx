'use client';

/**
 * LogoMarquee - Infinite scrolling logo showcase
 * Displays data source logos in a smooth, continuous animation
 */

// Professional SVG logos for financial data sources
// Using simplified/stylized versions that work well in monochrome

const logos = [
  {
    name: 'Reuters',
    // Orange dot is Reuters' signature
    svg: (
      <svg viewBox="0 0 120 32" className="h-6 w-auto">
        <circle cx="8" cy="16" r="6" fill="#FF8000" />
        <text x="22" y="22" fill="#FF8000" className="text-[18px] font-semibold" style={{ fontFamily: 'Arial, sans-serif' }}>
          Reuters
        </text>
      </svg>
    ),
  },
  {
    name: 'Bloomberg',
    // Terminal grid icon
    svg: (
      <svg viewBox="0 0 150 32" className="h-6 w-auto">
        <g fill="#FF6600">
          <rect x="0" y="8" width="5" height="5" />
          <rect x="7" y="8" width="5" height="5" />
          <rect x="0" y="15" width="5" height="5" />
          <rect x="7" y="15" width="5" height="5" />
        </g>
        <text x="20" y="23" className="text-[20px] font-bold" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '-0.5px' }}>
          <tspan className="fill-white">Bloomberg</tspan>
        </text>
      </svg>
    ),
  },
  {
    name: 'Nasdaq',
    // Rising chart line
    svg: (
      <svg viewBox="0 0 120 32" className="h-6 w-auto">
        <path
          d="M2 22 L6 18 L10 20 L14 12 L18 14 L22 8"
          stroke="#0093D0"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="28" y="23" fill="#0093D0" className="text-[20px] font-bold" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}>
          NASDAQ
        </text>
      </svg>
    ),
  },
  {
    name: 'NYSE',
    // Classical columns
    svg: (
      <svg viewBox="0 0 90 32" className="h-6 w-auto">
        <g className="fill-[#4A90D9]">
          <rect x="2" y="8" width="3" height="16" />
          <rect x="8" y="8" width="3" height="16" />
          <rect x="14" y="8" width="3" height="16" />
          <rect x="0" y="6" width="19" height="2" />
          <rect x="0" y="24" width="19" height="2" />
        </g>
        <text x="24" y="23" className="text-[20px] font-bold fill-[#4A90D9]" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '1px' }}>
          NYSE
        </text>
      </svg>
    ),
  },
  {
    name: 'SEC',
    // Shield icon
    svg: (
      <svg viewBox="0 0 80 32" className="h-6 w-auto">
        <path
          d="M10 6 L18 6 L18 18 C18 22 14 26 10 26 C6 26 2 22 2 18 L2 6 Z"
          className="fill-[#6B9BD2]"
        />
        <text x="24" y="23" className="text-[20px] font-bold fill-[#6B9BD2]" style={{ fontFamily: 'Arial, sans-serif' }}>
          SEC
        </text>
      </svg>
    ),
  },
  {
    name: 'Yahoo Finance',
    // Y! is already iconic
    svg: (
      <svg viewBox="0 0 130 32" className="h-6 w-auto">
        <text x="0" y="24" fill="#6001D2" className="text-[22px] font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>
          Y!
        </text>
        <text x="28" y="22" fill="#6001D2" className="text-[17px] font-semibold" style={{ fontFamily: 'Arial, sans-serif' }}>
          Finance
        </text>
      </svg>
    ),
  },
  {
    name: 'WSJ',
    // Newspaper dots pattern
    svg: (
      <svg viewBox="0 0 70 32" className="h-6 w-auto">
        <g className="fill-white" opacity="0.4">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="3" cy="13" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </g>
        <text x="14" y="23" className="text-[20px] font-bold fill-white" style={{ fontFamily: 'Georgia, serif' }}>
          WSJ
        </text>
      </svg>
    ),
  },
  {
    name: 'Federal Reserve',
    // Chart/data icon
    svg: (
      <svg viewBox="0 0 90 32" className="h-6 w-auto">
        <g className="stroke-[#5B8AC2]" fill="none" strokeWidth="2">
          <rect x="2" y="18" width="4" height="8" className="fill-[#5B8AC2]" />
          <rect x="8" y="12" width="4" height="14" className="fill-[#5B8AC2]" />
          <rect x="14" y="6" width="4" height="20" className="fill-[#5B8AC2]" />
        </g>
        <text x="24" y="23" className="text-[18px] font-bold fill-[#5B8AC2]" style={{ fontFamily: 'Arial, sans-serif' }}>
          FRED
        </text>
      </svg>
    ),
  },
  {
    name: 'CNBC',
    // Peacock feathers simplified
    svg: (
      <svg viewBox="0 0 95 32" className="h-6 w-auto">
        <g>
          <ellipse cx="8" cy="16" rx="3" ry="8" fill="#E31937" transform="rotate(-30 8 16)" />
          <ellipse cx="10" cy="16" rx="3" ry="8" fill="#FFB81C" transform="rotate(-10 10 16)" />
          <ellipse cx="12" cy="16" rx="3" ry="8" fill="#005594" transform="rotate(10 12 16)" />
        </g>
        <text x="22" y="23" fill="#005594" className="text-[20px] font-bold" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '1px' }}>
          CNBC
        </text>
      </svg>
    ),
  },
  {
    name: 'MarketWatch',
    // Clock/watch icon
    svg: (
      <svg viewBox="0 0 160 32" className="h-6 w-auto">
        <circle cx="12" cy="16" r="9" stroke="#00AC4E" strokeWidth="2" fill="none" />
        <line x1="12" y1="16" x2="12" y2="10" stroke="#00AC4E" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="16" x2="16" y2="16" stroke="#00AC4E" strokeWidth="2" strokeLinecap="round" />
        <text x="26" y="22" fill="#00AC4E" className="text-[18px] font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>
          MarketWatch
        </text>
      </svg>
    ),
  },
  {
    name: 'Benzinga',
    // Lightning bolt
    svg: (
      <svg viewBox="0 0 120 32" className="h-6 w-auto">
        <path
          d="M12 4 L6 16 L10 16 L8 28 L16 14 L12 14 L14 4 Z"
          fill="#F36F21"
        />
        <text x="22" y="22" fill="#F36F21" className="text-[18px] font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>
          Benzinga
        </text>
      </svg>
    ),
  },
  {
    name: 'Seeking Alpha',
    // Alpha symbol
    svg: (
      <svg viewBox="0 0 160 32" className="h-6 w-auto">
        <text x="0" y="24" fill="#F7931A" className="text-[22px] font-bold" style={{ fontFamily: 'Times New Roman, serif' }}>
          α
        </text>
        <text x="18" y="22" fill="#F7931A" className="text-[17px] font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>
          Seeking Alpha
        </text>
      </svg>
    ),
  },
];

interface LogoMarqueeProps {
  className?: string;
  speed?: 'slow' | 'normal' | 'fast';
  pauseOnHover?: boolean;
}

export default function LogoMarquee({
  className = '',
  speed = 'normal',
  pauseOnHover = true,
}: LogoMarqueeProps) {
  const speedClass = {
    slow: 'animate-[marquee_60s_linear_infinite]',
    normal: 'animate-[marquee_40s_linear_infinite]',
    fast: 'animate-[marquee_25s_linear_infinite]',
  }[speed];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Gradient masks for smooth fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Scrolling container */}
      <div
        className={`flex items-center gap-12 ${speedClass} ${pauseOnHover ? 'hover:[animation-play-state:paused]' : ''}`}
      >
        {/* First set of logos */}
        {logos.map((logo) => (
          <div
            key={logo.name}
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-300"
            title={logo.name}
          >
            {logo.svg}
          </div>
        ))}
        {/* Duplicate for seamless loop */}
        {logos.map((logo) => (
          <div
            key={`${logo.name}-dup`}
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-300"
            title={logo.name}
          >
            {logo.svg}
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact version for smaller spaces
export function LogoMarqueeCompact({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-8 ${className}`}>
      <span className="text-micro text-muted-foreground/70 uppercase tracking-wider flex-shrink-0">
        Data from
      </span>
      <div className="flex items-center gap-6 overflow-hidden">
        {logos.slice(0, 4).map((logo) => (
          <div
            key={logo.name}
            className="flex-shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            {logo.svg}
          </div>
        ))}
      </div>
    </div>
  );
}
