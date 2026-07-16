/**
 * ClipAI Logo — SVG component
 * ============================================================================
 * Concept: A bold play-button triangle that doubles as an upward arrow,
 * representing the journey from "clip" to "growth". The split cyan→violet
 * gradient represents the AI/dual-engine powering the platform. A small spark
 * accent in the top-right corner signals "AI magic".
 *
 * Variants:
 *   <Logo size="sm" />              — icon only (24px)
 *   <Logo size="md" showWord />     — icon + wordmark (32px, navbar default)
 *   <Logo size="lg" showWord />     — icon + wordmark (48px, footer/landing)
 *   <Logo variant="mono" />         — single-color (for dark backgrounds)
 *
 * The icon is also exported standalone as <LogoMark /> for favicons, splash
 * screens, and OG images.
 */

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LogoVariant = 'gradient' | 'mono' | 'flat';

const SIZE_MAP: Record<LogoSize, { icon: number; text: string }> = {
  xs: { icon: 18, text: 'text-base' },
  sm: { icon: 24, text: 'text-lg' },
  md: { icon: 32, text: 'text-xl' },
  lg: { icon: 44, text: 'text-2xl' },
  xl: { icon: 64, text: 'text-4xl' },
};

export function LogoMark({
  size = 32,
  variant = 'gradient',
  className = '',
}: {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}) {
  // The mark is a rounded square with a play/arrow triangle inside + spark.
  const id = `clipai-logo-${variant}-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {variant === 'gradient' && (
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00C2D6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        )}
        {variant === 'gradient' && (
          <linearGradient id={`${id}-tri`} x1="30" y1="25" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#C8CDD8" stopOpacity="0.85" />
          </linearGradient>
        )}
      </defs>

      {/* Rounded square container */}
      <rect
        x="4" y="4" width="92" height="92" rx="24" ry="24"
        fill={variant === 'gradient' ? `url(#${id}-bg)` : variant === 'flat' ? '#00C2D6' : 'currentColor'}
      />

      {/* Inner shadow / depth ring (gradient variant only) */}
      {variant === 'gradient' && (
        <rect
          x="4" y="4" width="92" height="92" rx="24" ry="24"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.15"
          strokeWidth="1.5"
        />
      )}

      {/* The play-button / upward-arrow triangle.
          It's a play triangle pointing right, but the top edge rises sharply,
          suggesting upward motion. Achieved by making the top vertex higher
          than the bottom-right vertex. */}
      <path
        d="M 32 26 L 32 74 L 76 50 Z"
        fill={variant === 'gradient' ? `url(#${id}-tri)` : '#08080A'}
      />

      {/* Spark accent — 4 small lines radiating from top-right corner of triangle.
          Signals "AI magic" + energy. */}
      <g
        stroke={variant === 'gradient' ? '#FFFFFF' : '#08080A'}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={variant === 'gradient' ? '0.9' : '1'}
      >
        <line x1="80" y1="22" x2="86" y2="16" />
        <line x1="84" y1="32" x2="92" y2="30" />
        <line x1="76" y1="16" x2="78" y2="8" />
      </g>

      {/* Tiny dot spark for extra energy */}
      <circle
        cx="90" cy="20"
        r="2.5"
        fill={variant === 'gradient' ? '#FFFFFF' : '#08080A'}
        opacity={variant === 'gradient' ? '0.8' : '1'}
      />
    </svg>
  );
}

export function Logo({
  size = 'md',
  showWord = false,
  variant = 'gradient',
  className = '',
  wordClassName = '',
}: {
  size?: LogoSize;
  showWord?: boolean;
  variant?: LogoVariant;
  className?: string;
  wordClassName?: string;
}) {
  const s = SIZE_MAP[size];
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={s.icon} variant={variant} />
      {showWord && (
        <span
          className={`font-display font-bold tracking-tight text-clip-text ${s.text} ${wordClassName}`}
        >
          Clip<span className="text-clip-cyan">AI</span>
        </span>
      )}
    </div>
  );
}

export default Logo;
