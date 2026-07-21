/**
 * ClipBotBubble.tsx — Floating ClipBot chat widget that replaces the
 * standalone ClipBot nav link. Three perfectly-tuned states:
 *
 * 1. BUBBLE   — a small floating cyan button (bottom-right) with a Bot icon
 *               and an unread-ping dot. Visible on every logged-in page.
 *               Click → opens the SEMI-PAGE panel.
 *
 * 2. SEMI-PAGE — a 400px-wide docked panel anchored to the right edge,
 *                full viewport height. Has its own header (with controls to
 *                expand to FULL-PAGE or close back to bubble). Chat scrolls
 *                independently; input pinned to bottom.
 *
 * 3. FULL-PAGE — a centred max-w-3xl modal-style overlay that takes the full
 *                viewport. Same chat content as semi-page but more breathing
 *                room. Has a button to shrink back to SEMI-PAGE.
 *
 * State is shared across all three views (single source of truth for messages,
 * typing indicator, input value), so switching modes mid-conversation is
 * seamless. Chat history is persisted to localStorage per-user and restored
 * on next mount — same as the old standalone ClipBotPage.
 *
 * The /clipbot route still exists for direct deep-link access; App.tsx renders
 * the full-page mode automatically when the user lands on /clipbot.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import {
  ArrowUp, Bot, Sparkles, Loader2, Zap,
  X, Minimize2, Maximize2, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { getClipBotHistory, apiClient } from '@/services/api';
import { TypingDots } from './Loading';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

interface ClipBotBubbleProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  /** Called when user clicks "expand to full page" — App.tsx navigates to /clipbot. */
  onNavigate?: (page: Page) => void;
  /** Optional forced mode — when 'full', renders as a full-page view (used by /clipbot route). */
  forcedMode?: 'full';
  /** When true, the bubble button is hidden (because we're already on /clipbot). */
  hideBubble?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const STARTER_PROMPTS = [
  { emoji: '🎮', text: 'What captions are blowing up for Free Fire this week?' },
  { emoji: '📈', text: 'How do I grow my gaming channel fast in Nigeria?' },
  { emoji: '🔥', text: 'Write me a viral title for a 1v4 clutch clip' },
  { emoji: '⏰', text: 'Best times to post gaming content on TikTok in Nigeria?' },
  { emoji: '💀', text: 'My last 5 videos flopped. What should I change?' },
  { emoji: '🎯', text: 'Give me a 30-day content plan for a Bloodstrike channel' },
];

const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'assistant',
  content: `Yo! I'm **ClipBot** 🤖 , your personal AI gaming content coach.\n\nI know everything about going viral on TikTok, YouTube Shorts, and Reels: especially in the Nigerian and African gaming scene.\n\nAsk me anything:\n• Viral titles & captions for your game\n• Growth strategies for your channel\n• What's trending right now\n• Content calendars & posting schedules\n• How to fix a flopping channel\n\nWhat do you want to work on? 🔥`,
  timestamp: new Date(),
};

type Mode = 'bubble' | 'semi' | 'full';

export function ClipBotBubble({ user, onNavigate, forcedMode, hideBubble }: ClipBotBubbleProps) {
  const [mode, setMode] = useState<Mode>(forcedMode || 'bubble');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput]       = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [hasNewPing, setHasNewPing] = useState(false);  // bubble badge

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const FREE_LIMIT = 10;
  const isAtLimit  = user?.plan === 'free' && msgCount >= FREE_LIMIT;

  // Sync forced mode prop (when App.tsx renders /clipbot route)
  useEffect(() => {
    if (forcedMode === 'full') setMode('full');
  }, [forcedMode]);

  // ─── Persist chat history to localStorage (per-user) ─────────────────────
  const STORAGE_KEY = `clipai_clipbot_history_${user?.email ?? 'anon'}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: Message[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
          setMsgCount(parsed.filter(m => m.role === 'user').length);
          return;
        }
      }
    } catch {}

    getClipBotHistory().then((data) => {
      if (data.history?.length) {
        const restored: Message[] = [
          WELCOME_MSG,
          ...data.history.map((h: any) => ({
            id: String(h.created_at),
            role: h.role as 'user' | 'assistant',
            content: h.content,
            timestamp: new Date(h.created_at),
          })),
        ];
        setMessages(restored);
        setMsgCount(data.history.filter((h: any) => h.role === 'user').length);
      }
    }).catch(() => {});
  }, [STORAGE_KEY]);

  // Persist on every message change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages, STORAGE_KEY]);

  // Auto-scroll to bottom on new messages / typing
  useEffect(() => {
    if (mode !== 'bubble') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, mode]);

  // Clear the new-ping badge when the user opens the panel
  useEffect(() => {
    if (mode !== 'bubble') setHasNewPing(false);
  }, [mode]);

  // Lock parent body scroll while ClipBot is in semi or full mode (covers viewport).
  useBodyScrollLock(mode !== 'bubble');

  // Esc closes semi → bubble; in full mode, Esc → semi (if not forced)
  useEffect(() => {
    if (mode === 'bubble') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (forcedMode === 'full') return;  // can't escape the route view
        setMode(prev => prev === 'full' ? 'semi' : 'bubble');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, forcedMode]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    if (isAtLimit) {
      toast.error('Free limit reached. Upgrade for unlimited ClipBot!');
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setMsgCount(n => n + 1);

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const data = await apiClient.post<{ reply?: string; error?: string; credits_remaining?: number }>('/clipbot', {
        message: content,
        history,
        user: { name: user?.name, plan: user?.plan },
      });

      let reply: string;
      if (data.reply) {
        reply = data.reply;
      } else {
        reply = getFallbackReply(content);
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);

      // If user closed the panel while we were typing, surface a ping
      setMode(prevMode => {
        if (prevMode === 'bubble') setHasNewPing(true);
        return prevMode;
      });
    } catch (e: any) {
      if (e?.status === 402) {
        setMessages(prev => prev.filter(m => m.id !== userMsg.id));
        setMsgCount(n => Math.max(0, n - 1));
        setIsTyping(false);
        return;
      }
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getFallbackReply(content),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [input, isAtLimit, messages, user?.name, user?.plan]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Don't render anything when bubble is hidden AND not forced into full mode
  if (hideBubble && mode === 'bubble') return null;

  // ─── BUBBLE STATE — floating button only
  if (mode === 'bubble') {
    return (
      <button
        onClick={() => setMode('semi')}
        aria-label="Open ClipBot chat"
        title="Chat with ClipBot"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-clip-cyan to-violet-600 text-black hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group shadow-[0_0_30px_rgba(0, 255, 255,0.45)] hover:shadow-[0_0_40px_rgba(0, 255, 255,0.65)]"
      >
        <Bot className="w-7 h-7" strokeWidth={2.2} />
        {/* Online dot */}
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-clip-dark" />
        {/* New message ping */}
        {hasNewPing && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-clip-amber text-[9px] font-bold text-black flex items-center justify-center animate-bounce">
            !
          </span>
        )}
        {/* Hover tooltip */}
        <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-clip-surface border border-white/[0.035] text-xs text-clip-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Ask ClipBot anything 💬
        </span>
      </button>
    );
  }

  // ─── SEMI-PAGE and FULL-PAGE share the same chat UI, just different container
  const isFull = mode === 'full';

  const containerClass = isFull
    // FULL-PAGE: full viewport, centred max-w-3xl
    ? 'fixed inset-0 z-50 bg-clip-dark/95 backdrop-blur-xl flex flex-col'
    // SEMI-PAGE: 400px docked right panel, full height
    : 'fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] bg-clip-surface/95 backdrop-blur-xl border-l border-white/[0.035] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.6)]';

  const headerClass = isFull
    ? 'flex items-center justify-between py-4 px-6 border-b border-white/[0.025] max-w-3xl mx-auto w-full'
    : 'flex items-center justify-between py-4 px-4 border-b border-white/[0.025]';

  const messagesWrapClass = isFull
    ? 'flex-1 overflow-y-auto py-8 px-6 max-w-3xl mx-auto w-full'
    : 'flex-1 overflow-y-auto py-6 px-4';

  const inputWrapClass = isFull
    ? 'py-4 px-6 border-t border-white/[0.025] max-w-3xl mx-auto w-full'
    : 'py-3 px-4 border-t border-white/[0.025]';

  return (
    <>
      {/* Backdrop for full-page mode */}
      {isFull && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => { if (forcedMode !== 'full') setMode('semi'); }}
        />
      )}

      <div className={containerClass}>
        {/* Header */}
        <div className={headerClass}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-clip-cyan" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-base text-clip-text leading-tight">ClipBot</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                <span className="text-[11px] text-clip-muted">AI Coach · Online</span>
              </div>
            </div>
          </div>

          {/* Window controls */}
          <div className="flex items-center gap-1">
            {isFull ? (
              // In FULL-PAGE mode, show two controls:
              //   1. (optional) Minimize to semi-page — only if not forced
              //   2. EXIT button — always shown in full mode. When forced
              //      (user is on /clipbot route), exit navigates back to the
              //      dashboard via onNavigate. When not forced, exit just
              //      collapses the bubble.
              !hideBubble && forcedMode !== 'full' && (
                <button
                  onClick={() => setMode('semi')}
                  title="Dock to side panel"
                  aria-label="Dock to side panel"
                  className="w-9 h-9 rounded-full border border-white/10 hover:border-white/30 flex items-center justify-center text-clip-muted hover:text-clip-text transition-colors"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              )
            ) : (
              // Expand to full page — either local full mode or navigate to /clipbot
              <button
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('clipbot');
                  } else {
                    setMode('full');
                  }
                }}
                title="Expand to full page"
                aria-label="Expand to full page"
                className="w-9 h-9 rounded-full border border-white/10 hover:border-white/30 flex items-center justify-center text-clip-muted hover:text-clip-text transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            {/* EXIT button — always visible in full-page mode (circled X).
                When forced full (user on /clipbot route), navigate to dashboard.
                Otherwise, collapse to bubble. */}
            {isFull && (
              <button
                onClick={() => {
                  if (forcedMode === 'full') {
                    // User is on the /clipbot route — navigate away
                    onNavigate?.('dashboard');
                  } else {
                    setMode('bubble');
                  }
                }}
                title={forcedMode === 'full' ? 'Exit to dashboard' : 'Close'}
                aria-label={forcedMode === 'full' ? 'Exit to dashboard' : 'Close chat'}
                className="w-9 h-9 rounded-full border border-white/15 hover:border-red-500/60 flex items-center justify-center text-clip-muted hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
            {/* Close → back to bubble (only when not in full-page mode) — circled X */}
            {!isFull && forcedMode !== 'full' && (
              <button
                onClick={() => setMode('bubble')}
                title="Close"
                aria-label="Close chat"
                className="w-9 h-9 rounded-full border border-white/15 hover:border-red-500/60 flex items-center justify-center text-clip-muted hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className={messagesWrapClass} style={{ minHeight: 0 }}>
          <div className={`space-y-6 ${isFull ? 'max-w-3xl mx-auto' : ''}`}>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'user' ? (
                  <div
                    className="max-w-[80%] bg-[#121212] text-clip-text px-4 py-2.5 text-[15px] leading-relaxed"
                    style={{ borderRadius: '22px' }}
                  >
                    <FormattedMessage content={msg.content} />
                  </div>
                ) : (
                  <div className="max-w-[88%] text-clip-text text-[15px] leading-relaxed">
                    <FormattedMessage content={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify start">
                <div className="px-1 py-2">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Starter prompts (shown when only welcome message) */}
        {messages.length === 1 && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${isFull ? 'max-w-3xl mx-auto px-6' : 'px-4'} pb-3`}>
            {STARTER_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => sendMessage(p.text)}
                className="card-glass p-3 text-left hover:border-clip-cyan/30 hover:bg-clip-cyan/3 transition-all text-sm">
                <span className="mr-2">{p.emoji}</span>
                <span className="text-clip-text">{p.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className={inputWrapClass}>
          {isAtLimit ? (
            <div className="card-glass p-4 border-clip-amber/20 bg-clip-amber/3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-clip-amber flex-shrink-0" />
                <p className="text-sm text-clip-text">
                  You've hit the free limit. Upgrade for unlimited ClipBot messages.
                </p>
              </div>
              <button
                onClick={() => onNavigate?.('pricing')}
                className="btn-primary text-sm px-5 py-2 whitespace-nowrap"
              >
                Upgrade
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (input.trim() && !isTyping) sendMessage(); }}
              className="relative flex items-center bg-[#121212] border border-white/[0.02] rounded-[26px] pl-5 pr-2 py-2 transition-all duration-200 focus-within:border-clip-cyan/40 focus-within:ring-1 focus-within:ring-clip-cyan/20"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask ClipBot anything about going viral…"
                className="flex-1 bg-transparent text-[15px] text-clip-text placeholder:text-clip-muted/60 focus:outline-none py-2.5 min-w-0"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                aria-label="Send message"
                className="ml-2 w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200 disabled:bg-white/[0.025] disabled:text-clip-muted/40 disabled:cursor-not-allowed enabled:bg-gradient-to-br enabled:from-clip-cyan enabled:to-violet-600 enabled:text-clip-dark enabled:hover:scale-105 enabled:active:scale-95 enabled:shadow-[0_0_20px_rgba(0, 255, 255,0.5)]"
              >
                {isTyping ? (
                  <Loader2 className="w-[18px] h-[18px] animate-spin" />
                ) : (
                  <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.5} />
                )}
              </button>
            </form>
          )}
          <p className="text-clip-muted text-xs mt-2 text-center flex items-center justify-center gap-1">
            <MessageSquare className="w-3 h-3" />
            ClipBot knows gaming content inside out
          </p>
        </div>
      </div>
    </>
  );
}

// ── Format markdown-ish bot messages (safe, no dangerouslySetInnerHTML) ─────

function FormattedMessage({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none
                    [&_ul]:space-y-1 [&_ul]:my-1
                    [&_li]:flex [&_li]:gap-2 [&_li]:items-start
                    [&_strong]:text-clip-cyan [&_strong]:font-semibold">
      <ReactMarkdown
        components={{
          li: ({ children }) => (
            <li className="flex gap-2">
              <Zap className="w-3 h-3 text-clip-cyan flex-shrink-0 mt-1" />
              <span>{children}</span>
            </li>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Fallback replies (when LLM is offline) ───────────────────────────────────

function getFallbackReply(msg: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes('title') || lower.includes('caption')) {
    return `Here are 5 viral title formats crushing it right now:\n\n• **"POV: you [what happened] in [game] 😤"** — huge on TikTok\n• **"Nobody expected this [game] clutch 💀"** — high CTR\n• **"They said it was impossible… [game] 🔥"** — great retention hook\n• **"Bro really said [action] 💀 #[game]"** — conversational, relatable\n• **"[Number]v[Number] clutch, [outcome] 🎯 watch till end"** — drives full watch\n\nPick the one that fits your clip and swap in the specifics. Want me to customise one for you?`;
  }

  if (lower.includes('grow') || lower.includes('channel')) {
    return `To grow a gaming channel fast in Nigeria, here's what actually works right now:\n\n• **Post 1x daily on TikTok** , volume beats perfection at the start\n• **Use Nigerian gaming hashtags** , #naijagamer #gamingafrica #[yourgame]\n• **Best posting times:** 7 to 9 PM WAT when Nigerian teens are off school\n• **First 2 seconds are everything** , start mid action, never with an intro\n• **Comment bait** , end every video with "drop a 💀 if you would've rage quit"\n• **Duet/stitch** popular clips in your game — free reach from existing audiences\n\nWhich platform are you focusing on?`;
  }

  if (lower.includes('time') || lower.includes('post') || lower.includes('when')) {
    return `Best times to post gaming content in Nigeria (WAT):\n\n• **TikTok:** 7:00 PM – 10:00 PM (peak scroll time after school/work)\n• **YouTube Shorts:** 6:00 PM – 9:00 PM, also 12:00 PM – 2:00 PM\n• **Instagram Reels:** 8:00 PM – 11:00 PM\n\n• **Best days:** Friday, Saturday, Sunday — 30–40% more reach\n• **Avoid:** Monday–Wednesday mornings\n\nConsistency beats perfect timing though — same time every day builds algorithm trust. What game do you create for?`;
  }

  if (lower.includes('flop') || lower.includes('views') || lower.includes('not working')) {
    return `If your videos are flopping, here are the most common reasons and fixes:\n\n• **Weak hook** — first 1–2 seconds aren't stopping the scroll. Start with the most exciting moment.\n• **Too long** , keep clips under 30 seconds. Cut everything before the hype.\n• **Wrong hashtags** , don't use mega tags only. Mix mega + mid + niche (3+5+5 rule).\n• **Posting dead times** — post 7–9 PM WAT on weekdays, any time on weekends.\n• **No call to action** — always ask for something: "drop a 💀", "comment your score", "share if you agree"\n\nSend me your last video's title and I'll tell you exactly what to fix.`;
  }

  if (lower.includes('plan') || lower.includes('calendar') || lower.includes('schedule')) {
    return `Here's a simple 30-day content plan for a gaming channel:\n\n• **Week 1:** Post daily: 1 highlight clip, 1 reaction, 1 tip, 1 "first time playing" style video, rest are pure highlights\n• **Week 2:** Find your 2 best performing formats and double down\n• **Week 3:** Add trending sounds to your clips. Stitch/duet 2 viral gaming videos.\n• **Week 4:** Post your best clip yet. Ask followers what game they want to see next.\n\nKey rule: **Analyse week 1 data before week 2 starts.** Double what worked, cut what didn't.\n\nWant a more specific plan for your game?`;
  }

  return `Great question! Here's my take:\n\nThe gaming content scene: especially in Nigeria: is moving incredibly fast right now. The creators winning are doing 3 things:\n\n• **Speed** , upload within 24 hours of a highlight happening while the adrenaline shows\n• **Authenticity** , genuine reactions beat polished edits every time for teenage audiences\n• **Consistency** , the algorithm rewards creators who show up daily, even with short clips\n\nTell me more about what you're working on and I'll give you specific advice. What game do you mainly play?`;
}
