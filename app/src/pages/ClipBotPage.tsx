import { useState, useRef, useEffect } from 'react';
import type { Page } from '../App';
import { Send, Bot, User, Zap, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { getClipBotHistory, apiClient } from '@/services/api';

interface ClipBotPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
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
  content: `Yo! I'm **ClipBot** 🤖 — your personal AI gaming content coach.\n\nI know everything about going viral on TikTok, YouTube Shorts, and Reels — especially in the Nigerian and African gaming scene.\n\nAsk me anything:\n• Viral titles & captions for your game\n• Growth strategies for your channel\n• What's trending right now\n• Content calendars & posting schedules\n• How to fix a flopping channel\n\nWhat do you want to work on? 🔥`,
  timestamp: new Date(),
};

export function ClipBotPage({ user, onNavigate }: ClipBotPageProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput]       = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const FREE_LIMIT = 10;
  const isAtLimit  = user?.plan === 'free' && msgCount >= FREE_LIMIT;

  // ─── Persist chat history to localStorage (per-user) ─────────────────────
  const STORAGE_KEY = `clipai_clipbot_history_${user?.email ?? 'anon'}`;

  useEffect(() => {
    // Restore from localStorage first for instant UX
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

    // Then try fetching from backend
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async (text?: string) => {
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
      // Build conversation history for context
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      // Use apiClient which automatically includes the Supabase JWT
      const data = await apiClient.post<{ reply?: string; error?: string }>('/clipbot', {
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
    } catch {
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([WELCOME_MSG]);
    setMsgCount(0);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen pt-20 flex flex-col">
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-clip-cyan" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-clip-text">ClipBot</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-clip-muted">AI Coach · Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.plan === 'free' && (
              <span className="text-xs text-clip-muted">
                {FREE_LIMIT - msgCount} msgs left
              </span>
            )}
            <button onClick={resetChat}
              className="p-2 text-clip-muted hover:text-clip-text hover:bg-clip-surface rounded-lg transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6 space-y-4" style={{ minHeight: 0 }}>
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant' ? 'bg-clip-cyan/10' : 'bg-clip-surface border border-white/[0.08]'
              }`}>
                {msg.role === 'assistant'
                  ? <Bot className="w-4 h-4 text-clip-cyan" />
                  : <User className="w-4 h-4 text-clip-muted" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-clip-cyan/10 border border-clip-cyan/20 text-clip-text'
                  : 'bg-clip-surface border border-white/[0.06] text-clip-text'
              }`}>
                <FormattedMessage content={msg.content} />
                <p className="text-clip-muted text-xs mt-2 opacity-60">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-clip-cyan" />
              </div>
              <div className="bg-clip-surface border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-clip-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-clip-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-clip-muted animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Starter prompts (shown when only welcome message) */}
        {messages.length === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {STARTER_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => sendMessage(p.text)}
                className="card-glass p-3 text-left hover:border-clip-cyan/30 hover:bg-clip-cyan/5 transition-all text-sm">
                <span className="mr-2">{p.emoji}</span>
                <span className="text-clip-text">{p.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="py-4 border-t border-white/[0.06]">
          {isAtLimit ? (
            <div className="card-glass p-4 border-clip-amber/20 bg-clip-amber/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-clip-amber flex-shrink-0" />
                <p className="text-sm text-clip-text">
                  You've hit the free limit. Upgrade for unlimited ClipBot messages.
                </p>
              </div>
              <button onClick={() => onNavigate('pricing')} className="btn-primary text-sm px-5 py-2 whitespace-nowrap">
                Upgrade
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask ClipBot anything about going viral…"
                className="input-dark flex-1 text-sm"
                disabled={isTyping}
              />
              <button onClick={() => sendMessage()}
                disabled={!input.trim() || isTyping}
                className="btn-primary px-4 py-3 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {isTyping ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          )}
          <p className="text-clip-muted text-xs mt-2 text-center">
            Powered by Groq Llama 3.3 70B · ClipBot knows gaming content inside out
          </p>
        </div>

      </div>
    </div>
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
          // Render bullet list items with a Zap icon prefix
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

// ── Fallback replies (Groq offline) ──────────────────────────────────────────

function getFallbackReply(msg: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes('title') || lower.includes('caption')) {
    return `Here are 5 viral title formats crushing it right now:\n\n• **"POV: you [what happened] in [game] 😤"** — huge on TikTok\n• **"Nobody expected this [game] clutch 💀"** — high CTR\n• **"They said it was impossible… [game] 🔥"** — great retention hook\n• **"Bro really said [action] 💀 #[game]"** — conversational, relatable\n• **"[Number]v[Number] clutch, [outcome] 🎯 watch till end"** — drives full watch\n\nPick the one that fits your clip and swap in the specifics. Want me to customise one for you?`;
  }

  if (lower.includes('grow') || lower.includes('channel')) {
    return `To grow a gaming channel fast in Nigeria, here's what actually works right now:\n\n• **Post 1x daily on TikTok** — volume beats perfection at the start\n• **Use Nigerian gaming hashtags** — #naijagamer #gamingafrica #[yourgame]\n• **Best posting times:** 7–9 PM WAT when Nigerian teens are off school\n• **First 2 seconds are everything** — start mid-action, never with an intro\n• **Comment bait** — end every video with "drop a 💀 if you would've rage quit"\n• **Duet/stitch** popular clips in your game — free reach from existing audiences\n\nWhich platform are you focusing on?`;
  }

  if (lower.includes('time') || lower.includes('post') || lower.includes('when')) {
    return `Best times to post gaming content in Nigeria (WAT):\n\n• **TikTok:** 7:00 PM – 10:00 PM (peak scroll time after school/work)\n• **YouTube Shorts:** 6:00 PM – 9:00 PM, also 12:00 PM – 2:00 PM\n• **Instagram Reels:** 8:00 PM – 11:00 PM\n\n• **Best days:** Friday, Saturday, Sunday — 30–40% more reach\n• **Avoid:** Monday–Wednesday mornings\n\nConsistency beats perfect timing though — same time every day builds algorithm trust. What game do you create for?`;
  }

  if (lower.includes('flop') || lower.includes('views') || lower.includes('not working')) {
    return `If your videos are flopping, here are the most common reasons and fixes:\n\n• **Weak hook** — first 1–2 seconds aren't stopping the scroll. Start with the most exciting moment.\n• **Too long** — keep clips under 30 seconds. Cut everything before the hype.\n• **Wrong hashtags** — don't use mega tags only. Mix mega + mid + niche (3+5+5 rule).\n• **Posting dead times** — post 7–9 PM WAT on weekdays, any time on weekends.\n• **No call to action** — always ask for something: "drop a 💀", "comment your score", "share if you agree"\n\nSend me your last video's title and I'll tell you exactly what to fix.`;
  }

  if (lower.includes('plan') || lower.includes('calendar') || lower.includes('schedule')) {
    return `Here's a simple 30-day content plan for a gaming channel:\n\n• **Week 1:** Post daily — 1 highlight clip, 1 reaction, 1 tip, 1 "first time playing" style video, rest are pure highlights\n• **Week 2:** Find your 2 best performing formats and double down\n• **Week 3:** Add trending sounds to your clips. Stitch/duet 2 viral gaming videos.\n• **Week 4:** Post your best clip yet. Ask followers what game they want to see next.\n\nKey rule: **Analyse week 1 data before week 2 starts.** Double what worked, cut what didn't.\n\nWant a more specific plan for your game?`;
  }

  return `Great question! Here's my take:\n\nThe gaming content scene — especially in Nigeria — is moving incredibly fast right now. The creators winning are doing 3 things:\n\n• **Speed** — upload within 24 hours of a highlight happening while the adrenaline shows\n• **Authenticity** — genuine reactions beat polished edits every time for teenage audiences\n• **Consistency** — the algorithm rewards creators who show up daily, even with short clips\n\nTell me more about what you're working on and I'll give you specific advice. What game do you mainly play?`;
}
