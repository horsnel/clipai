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
  SiCounterstrike,
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
// Most AAA games don't have Simple Icons entries (publisher brand-use policy).
// We use the brand icon where available and fall back to emoji otherwise.

type GameEntry = {
  Icon: ComponentType<SVGProps<SVGSVGElement>> | null;
  emoji: string;
};

// Lookup by case-insensitive game name.
const GAME_ICONS: Record<string, GameEntry> = {
  // Games with brand icons in react-icons/si
  'fortnite':        { Icon: SiFortnite,       emoji: '🏗️' },
  'valorant':        { Icon: SiValorant,       emoji: '🎯' },
  'roblox':          { Icon: SiRoblox,         emoji: '🧱' },
  'pubg':            { Icon: SiPubg,           emoji: '🪖' },
  'fifa':            { Icon: SiFifa,           emoji: '⚽' },
  'ea sports fc':    { Icon: SiEa,             emoji: '⚽' },
  'call of duty':    { Icon: SiCounterstrike,  emoji: '🎯' },  // closest available
  // Games without brand icons — fall back to emoji
  'free fire':       { Icon: null,             emoji: '🔥' },
  'bloodstrike':     { Icon: null,             emoji: '🩸' },
  'apex legends':    { Icon: null,             emoji: '⚡' },
  'mobile legends':  { Icon: null,             emoji: '🛡️' },
  'minecraft':       { Icon: null,             emoji: '⛏️' },
  'gta v':           { Icon: null,             emoji: '🚗' },
  'gta':             { Icon: null,             emoji: '🚗' },
};

type GameIconProps = {
  game: string;
  className?: string;
};

/**
 * Renders the brand icon for a game. Case-insensitive match. Falls back to
 * emoji if no brand icon is available for the game.
 */
export function GameIcon({ game, className = 'w-5 h-5' }: GameIconProps) {
  const key = (game || '').toLowerCase().trim();
  const entry = GAME_ICONS[key];
  if (entry?.Icon) {
    const Comp = entry.Icon;
    return <Comp className={className} aria-hidden="true" />;
  }
  if (entry?.emoji) {
    return <span className={className} aria-hidden="true" style={{ fontSize: '1em' }}>{entry.emoji}</span>;
  }
  // Unknown game — generic gamepad emoji
  return <span className={className} aria-hidden="true" style={{ fontSize: '1em' }}>🎮</span>;
}

// ─── Footer / social links ───────────────────────────────────────────────────
// The footer uses these for external social links. Same brand icons.
// Also re-export SiX + SiInstagram so the Footer can render them directly
// (alongside SiGithub) without going through the PlatformIcon component.
export { SiGithub, SiDiscord, SiX, SiInstagram } from 'react-icons/si';
