/**
 * BrandIcons.tsx — Centralized brand icon registry.
 *
 * Uses react-icons/si (Simple Icons) for official brand SVGs. For brands that
 * don't have an official Simple Icons entry (e.g. some game studios block
 * brand-use rights), we fall back to emoji.
 *
 * Why central: previously each component imported `Youtube`/`Twitter`/
 * `Instagram`/`Music2` from lucide-react, which look nothing like the real
 * brand logos. Now every component imports from this module so the brand
 * presentation is consistent app-wide.
 *
 * Usage:
 *   import { PlatformIcon, GameIcon, PLATFORM_ICONS } from '@/components/BrandIcons';
 *
 *   <PlatformIcon platform="youtube" className="w-4 h-4" />
 *   <GameIcon game="Fortnite" className="w-5 h-5" />
 *   const Icon = PLATFORM_ICONS.twitter;  // → SiX component
 */
import type { ComponentType, SVGProps } from 'react';
import {
  SiYoutube,
  SiTiktok,
  SiInstagram,
  SiX,           // X (formerly Twitter) — the real X logo
  SiReddit,
  SiTwitch,
  SiFortnite,
  SiValorant,
  SiRoblox,
  SiPubg,
  SiFifa,
  SiEa,          // EA Sports (FIFA publisher)
} from 'react-icons/si';

// ─── Social media / content platforms ─────────────────────────────────────────
// The platform IDs match the backend (AuditPlatform type): youtube, tiktok,
// instagram, twitter (kept as 'twitter' for API/DB compatibility, but the
// LABEL is 'X' and the icon is the real X logo).

export type PlatformId = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'reddit' | 'twitch';

type IconEntry = {
  /** The react-icons component (or null if no brand icon exists). */
  Icon: ComponentType<SVGProps<SVGSVGElement>> | null;
  /** Display label shown to users. */
  label: string;
  /** Tailwind text-color class for the brand color. */
  color: string;
  /** Emoji fallback (used if Icon is null OR as a decorative companion). */
  emoji: string;
};

export const PLATFORM_ICONS: Record<PlatformId, IconEntry> = {
  youtube: {
    Icon: SiYoutube,
    label: 'YouTube',
    color: 'text-red-500',
    emoji: '▶️',
  },
  tiktok: {
    Icon: SiTiktok,
    label: 'TikTok',
    color: 'text-clip-text',
    emoji: '🎵',
  },
  instagram: {
    Icon: SiInstagram,
    label: 'Instagram',
    color: 'text-pink-500',
    emoji: '📷',
  },
  twitter: {
    // ID stays 'twitter' for backend compat; label + icon are X.
    Icon: SiX,
    label: 'X',
    color: 'text-clip-text',
    emoji: '✖️',
  },
  reddit: {
    Icon: SiReddit,
    label: 'Reddit',
    color: 'text-orange-500',
    emoji: '🤖',
  },
  twitch: {
    Icon: SiTwitch,
    label: 'Twitch',
    color: 'text-purple-500',
    emoji: '🎮',
  },
};

type PlatformIconProps = {
  platform: string;
  className?: string;
  /** Use the brand color instead of inheriting from parent. */
  brandColor?: boolean;
};

/**
 * Renders the brand icon for a platform. If the platform is unknown or has no
 * brand icon, falls back to an emoji span.
 */
export function PlatformIcon({ platform, className = 'w-4 h-4', brandColor = false }: PlatformIconProps) {
  const entry = PLATFORM_ICONS[platform as PlatformId];
  if (!entry) {
    return <span className={className}>❓</span>;
  }
  if (entry.Icon) {
    const Comp = entry.Icon;
    return <Comp className={`${className} ${brandColor ? entry.color : ''}`} aria-hidden="true" />;
  }
  return <span className={className} aria-hidden="true">{entry.emoji}</span>;
}

// ─── Games ────────────────────────────────────────────────────────────────────
// Brand icon strategy for games:
//   1. If react-icons/si has an official brand SVG → use it as an inline <Icon>.
//   2. Otherwise, if /public/brand-icons/<slug>.svg exists (downloaded from
//      Wikimedia Commons or generated locally) → render via <img>.
//   3. Otherwise, fall back to a generic gamepad emoji.
//
// Most AAA games don't have Simple Icons entries due to publisher brand-use
// policy, so we host the brand SVGs we need in /public/brand-icons/.

type GameEntry = {
  /** Inline react-icons component, if available. */
  Icon?: ComponentType<SVGProps<SVGSVGElement>> | null;
  /** Path under /public to a hosted SVG (used when Icon is null). */
  src?: string;
  /** Emoji fallback (used if both Icon and src are absent). */
  emoji?: string;
};

// Lookup by case-insensitive game name. Keys are normalized (lowercase, trimmed).
// Aliases map multiple spellings to the same brand icon.
const GAME_ICONS: Record<string, GameEntry> = {
  // ── Games with react-icons brand SVGs ──────────────────────────────────
  'fortnite':       { Icon: SiFortnite,      emoji: '🏗️' },
  'valorant':       { Icon: SiValorant,      emoji: '🎯' },
  'roblox':         { Icon: SiRoblox,        emoji: '🧱' },
  'pubg':           { Icon: SiPubg,          emoji: '🪖' },
  'fifa':           { Icon: SiFifa,          emoji: '⚽' },
  'ea sports fc':   { Icon: SiEa,            emoji: '⚽' },

  // ── Games with hosted SVGs in /public/brand-icons/ ─────────────────────
  // Official logos from Wikimedia Commons / Simple Icons CDN where available,
  // custom-generated lettermark SVGs where not (see /scripts/make_game_svgs.py).
  'call of duty':   { src: '/brand-icons/call-of-duty.svg' },
  'cod':            { src: '/brand-icons/call-of-duty.svg' },
  'warzone':        { src: '/brand-icons/warzone.svg' },
  'apex legends':   { src: '/brand-icons/apex-legends.svg' },
  'apex':           { src: '/brand-icons/apex-legends.svg' },
  'minecraft':      { src: '/brand-icons/minecraft.svg' },
  'free fire':      { src: '/brand-icons/free-fire.svg' },
  'garena free fire': { src: '/brand-icons/free-fire.svg' },
  'bloodstrike':    { src: '/brand-icons/bloodstrike.svg' },
  'blood strike':   { src: '/brand-icons/bloodstrike.svg' },
  'mobile legends': { src: '/brand-icons/mobile-legends.svg' },
  'mobile legends: bang bang': { src: '/brand-icons/mobile-legends.svg' },
  'mlbb':           { src: '/brand-icons/mobile-legends.svg' },
  'gta v':          { src: '/brand-icons/grand-theft-auto.svg' },
  'gta':            { src: '/brand-icons/grand-theft-auto.svg' },
  'grand theft auto': { src: '/brand-icons/grand-theft-auto.svg' },
  'grand theft auto v': { src: '/brand-icons/grand-theft-auto.svg' },

  // ── "Mobile (PUBG/FF/ML)" composite entry from the waitlist page ──────
  // Renders the PUBG icon since PUBG is listed first in the composite label.
  'mobile':         { Icon: SiPubg,          emoji: '📱' },
  'mobile (pubg/ff/ml)': { Icon: SiPubg,     emoji: '📱' },
};

type GameIconProps = {
  game: string;
  className?: string;
};

/**
 * Renders the brand icon for a game. Case-insensitive match. Resolution order:
 *   1. Inline react-icons brand SVG (cleanest, scales perfectly)
 *   2. Hosted SVG file in /public/brand-icons/ (next-best — real brand logo)
 *   3. Emoji fallback
 *   4. Generic gamepad emoji (unknown game)
 */
export function GameIcon({ game, className = 'w-5 h-5' }: GameIconProps) {
  const key = (game || '').toLowerCase().trim();
  const entry = GAME_ICONS[key];

  // 1. Inline react-icons component
  if (entry?.Icon) {
    const Comp = entry.Icon;
    return <Comp className={className} aria-hidden="true" />;
  }

  // 2. Hosted SVG file — rendered as a CSS mask so it inherits the parent's
  //    text color (currentColor). All hosted SVGs in /public/brand-icons/
  //    are patched to single-color `fill="currentColor"` (see
  //    /scripts/patch_brand_svgs.py), so the mask paints the silhouette in
  //    whatever color the surrounding button/text uses.
  if (entry?.src) {
    return (
      <span
        aria-hidden="true"
        className={`${className} inline-block bg-current`}
        style={{
          maskImage: `url(${entry.src})`,
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskImage: `url(${entry.src})`,
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          WebkitMaskSize: 'contain',
        }}
      />
    );
  }

  // 3. Emoji fallback
  if (entry?.emoji) {
    return <span className={className} aria-hidden="true" style={{ fontSize: '1em' }}>{entry.emoji}</span>;
  }

  // 4. Unknown game — generic gamepad emoji
  return <span className={className} aria-hidden="true" style={{ fontSize: '1em' }}>🎮</span>;
}

// ─── Footer / social links ───────────────────────────────────────────────────
// The footer uses these for external social links. Same brand icons.
// Also re-export SiX + SiInstagram so the Footer can render them directly
// (alongside SiGithub) without going through the PlatformIcon component.
export { SiGithub, SiDiscord, SiX, SiInstagram } from 'react-icons/si';
