import Image from 'next/image';

interface ReportHeroBannerProps {
  src: string;
  alt?: string;
  priority?: boolean;
}

export function ReportHeroBanner({
  src,
  alt = '',
  priority = false,
}: ReportHeroBannerProps) {
  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-border/40 bg-card/50 animate-fade-in-up delay-150">
      <Image
        src={src}
        alt={alt}
        width={1917}
        height={861}
        className="aspect-[16/7] w-full object-cover opacity-95 contrast-110 md:aspect-[21/7]"
        priority={priority}
      />
    </div>
  );
}
