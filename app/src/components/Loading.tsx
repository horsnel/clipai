/**
 * ClipAI Loading Components — premium loading animations
 * ============================================================================
 * Three components:
 *   1. <ParticleLoader />   — full-page "AI thinking" particle stream + logo
 *   2. <SkeletonShimmer />  — skeleton card with branded pulse
 *   3. <ProgressBar />      — slim top-of-screen progress bar (NProgress style)
 *
 * Brand: cyan (#00F0FF) + violet (#8B5CF6) on near-black (#0B0B0D).
 */

import { useEffect, useState, useRef } from 'react';

// ─── ParticleLoader ─────────────────────────────────────────────────────────
// Full-card loader. Renders a stream of glowing particles that flow toward a
// central pulsing dot (the "AI core"). Pairs with multi-stage status text.
//
// Usage:
//   <ParticleLoader stages={['Scanning YouTube', 'Analyzing Reddit', 'Synthesizing']} />
//   <ParticleLoader text="Generating captions…" />

const PARTICLE_COUNT = 14;

type Particle = {
  id: number;
  startX: number;  // 0-100 (% of container width)
  startY: number;  // 0-100
  delay: number;   // ms
  duration: number; // ms
  size: number;    // px
  hue: 'cyan' | 'violet';
};

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const side = Math.floor(Math.random() * 4); // 0=top,1=right,2=bottom,3=left
    let startX = 50, startY = 50;
    if (side === 0) { startX = Math.random() * 100; startY = -5; }
    else if (side === 1) { startX = 105; startY = Math.random() * 100; }
    else if (side === 2) { startX = Math.random() * 100; startY = 105; }
    else { startX = -5; startY = Math.random() * 100; }
    return {
      id: i,
      startX, startY,
      delay: Math.random() * 1500,
      duration: 1200 + Math.random() * 800,
      size: 3 + Math.random() * 4,
      hue: Math.random() > 0.5 ? 'cyan' : 'violet',
    };
  });
}

export function ParticleLoader({
  text,
  stages,
  stageIntervalMs = 1800,
  className = '',
}: {
  text?: string;
  stages?: string[];
  stageIntervalMs?: number;
  className?: string;
}) {
  const [particles] = useState(makeParticles);
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (!stages || stages.length <= 1) return;
    const t = setInterval(() => {
      setStageIdx((i) => (i + 1) % stages.length);
    }, stageIntervalMs);
    return () => clearInterval(t);
  }, [stages, stageIntervalMs]);

  const statusText = stages ? stages[stageIdx] : (text || 'Thinking…');

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-6 py-16 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Particle canvas */}
      <div className="relative w-48 h-48 mx-auto">
        {/* Glow halo */}
        <div className="absolute inset-0 rounded-full bg-clip-cyan/10 blur-2xl animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-clip-cyan/20 blur-xl animate-pulse" style={{ animationDelay: '300ms' }} />

        {/* Orbiting rings */}
        <div
          className="absolute inset-0 rounded-full border border-clip-cyan/30"
          style={{ animation: 'clipai-spin 4s linear infinite' }}
        />
        <div
          className="absolute inset-3 rounded-full border border-violet-400/20"
          style={{ animation: 'clipai-spin 6s linear infinite reverse' }}
        />
        <div
          className="absolute inset-6 rounded-full border border-clip-cyan/10"
          style={{ animation: 'clipai-spin 3s linear infinite' }}
        />

        {/* Particles flying toward center */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.startX}%`,
              top: `${p.startY}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.hue === 'cyan' ? '#00F0FF' : '#8B5CF6',
              boxShadow: `0 0 8px ${p.hue === 'cyan' ? '#00F0FF' : '#8B5CF6'}`,
              animation: `clipai-particle-in ${p.duration}ms ease-in ${p.delay}ms infinite`,
            }}
          />
        ))}

        {/* Central pulsing core */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="w-6 h-6 rounded-full bg-clip-cyan"
            style={{
              boxShadow: '0 0 24px #00F0FF, 0 0 48px #00F0FF',
              animation: 'clipai-core-pulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Status text */}
      <div className="text-center space-y-1.5">
        <div className="text-clip-text font-medium text-base flex items-center justify-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-clip-cyan animate-pulse" />
          {statusText}
        </div>
        {stages && stages.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {stages.map((_, i) => (
              <div
                key={i}
                className={`h-0.5 rounded-full transition-all duration-300 ${
                  i === stageIdx ? 'w-6 bg-clip-cyan' : i < stageIdx ? 'w-2 bg-clip-cyan/40' : 'w-2 bg-clip-border'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes clipai-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes clipai-core-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.7; }
        }
        @keyframes clipai-particle-in {
          0% { transform: translate(0, 0) scale(0); opacity: 0; }
          20% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% {
            transform: translate(
              calc(50% - var(--start-x, 0%)),
              calc(50% - var(--start-y, 0%))
            ) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ─── SkeletonShimmer ─────────────────────────────────────────────────────────
// A skeleton card with a slow cyan→violet shimmer sweep. Use for lists,
// dashboard cards, or any placeholder where you'd otherwise show "Loading…".

export function SkeletonShimmer({
  className = '',
  lines = 3,
  avatar = false,
}: {
  className?: string;
  lines?: number;
  avatar?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-clip-border bg-clip-surface p-4 ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(110deg, transparent 30%, rgba(0,240,255,0.06) 50%, rgba(139,92,246,0.06) 60%, transparent 80%)',
          backgroundSize: '200% 100%',
          animation: 'clipai-shimmer 2.4s ease-in-out infinite',
        }}
      />
      <div className="relative flex items-start gap-3">
        {avatar && (
          <div className="w-10 h-10 rounded-full bg-clip-border flex-shrink-0" />
        )}
        <div className="flex-1 space-y-2.5">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="h-3 rounded bg-clip-border"
              style={{ width: `${[100, 80, 60, 90][i % 4]}%` }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes clipai-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─── SkeletonList ────────────────────────────────────────────────────────────
// Renders N skeleton rows — drop-in for trend lists, leaderboard, etc.

export function SkeletonList({ count = 5, avatar = false }: { count?: number; avatar?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonShimmer key={i} lines={2} avatar={avatar} />
      ))}
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
// Slim progress bar that sits at the top of the viewport. Mount when loading,
// unmount when done. Auto-progresses to 90% then waits for unmount.

export function ProgressBar({ active }: { active: boolean }) {
  const [width, setWidth] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setWidth(100);
      const t = setTimeout(() => setWidth(0), 250);
      return () => clearTimeout(t);
    }
    setWidth(15);
    let target = 15;
    const tick = () => {
      // Asymptotically approach 90% — never completes until unmount
      target = target + (90 - target) * 0.04;
      setWidth(target);
      rafRef.current = requestAnimationFrame(() => {
        setTimeout(tick, 300 + Math.random() * 200);
      });
    };
    const t = setTimeout(tick, 200);
    return () => {
      clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (width === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] pointer-events-none">
      <div
        className="h-full transition-all duration-300 ease-out"
        style={{
          width: `${width}%`,
          background: 'linear-gradient(90deg, #00F0FF 0%, #8B5CF6 100%)',
          boxShadow: '0 0 8px #00F0FF',
        }}
      />
    </div>
  );
}

// ─── TypingDots ──────────────────────────────────────────────────────────────
// Three dots bouncing — use inside chat bubbles (ClipBot).

export function TypingDots({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`} aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-clip-cyan"
          style={{
            animation: `clipai-typing 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes clipai-typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
