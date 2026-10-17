import Link from "next/link";

// Cœur + onde vocale, comme sur les maquettes
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sa-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5793f2" />
          <stop offset="1" stopColor="#1a4ca8" />
        </linearGradient>
      </defs>
      <path
        d="M24 41.5c-1 0-2-.4-2.7-1.1C12.8 32.8 5 26.5 5 17.6 5 11.7 9.6 7 15.3 7c3.4 0 6.5 1.7 8.7 4.3C26.2 8.7 29.3 7 32.7 7 38.4 7 43 11.7 43 17.6c0 8.9-7.8 15.2-16.3 22.8-.7.7-1.7 1.1-2.7 1.1Z"
        fill="none"
        stroke="url(#sa-heart)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <g stroke="#1f5fd0" strokeWidth="3" strokeLinecap="round">
        <line x1="17" y1="21" x2="17" y2="25" />
        <line x1="21.5" y1="17.5" x2="21.5" y2="28.5" />
        <line x1="26" y1="19.5" x2="26" y2="26.5" />
        <line x1="30.5" y1="15.5" x2="30.5" y2="30.5" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Senior Assistant — accueil">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[17px] font-extrabold tracking-tight text-brand-900">Senior Assistant</span>
        {subtitle && <span className="block text-xs font-medium text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
