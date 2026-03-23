import Link from 'next/link';

interface AiChatLinkProps {
  href: string;
  label?: string;
  size?: 'sm' | 'default';
  className?: string;
}

const sparklesSvgPath =
  'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z';

export function AiChatLink({ href, label = '和 AI 聊聊', size = 'default', className = '' }: AiChatLinkProps) {
  const sizeClasses =
    size === 'sm'
      ? 'gap-1.5 px-2.5 py-1 rounded-md text-xs'
      : 'gap-2 px-4 py-2 rounded-lg text-sm';

  const iconClasses = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <Link
      href={href}
      className={`group inline-flex items-center font-medium bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary/90 shadow-sm hover:shadow-lg hover:shadow-primary/20 shrink-0 ${sizeClasses} ${className}`}
    >
      <svg
        className={`${iconClasses} transition-transform duration-300 group-hover:scale-110`}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d={sparklesSvgPath} />
      </svg>
      {label}
    </Link>
  );
}
