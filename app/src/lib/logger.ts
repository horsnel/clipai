/**
 * Frontend error logger — posts to /api/log
 * ============================================================================
 * Simple Sentry alternative. Captures:
 *   - window.onerror (uncaught exceptions)
 *   - unhandledrejection events
 *   - Manual logger.error()/warn()/info() calls
 *
 * Rate-limited server-side to 10/min per IP. Failures are silent (we never
 * want error logging itself to break the app).
 */

const LOG_ENDPOINT = '/api/log';
const MAX_QUEUE = 20;
const FLUSH_INTERVAL_MS = 5000;

type LogLevel = 'error' | 'warn' | 'info';
type LogEntry = {
  level: LogLevel;
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  extras?: Record<string, unknown>;
  timestamp: string;
};

let queue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let userId: string | undefined = undefined;

export function setLoggerUser(id: string | undefined) {
  userId = id;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch }),
      keepalive: true,  // fire-and-forget even on page unload
    });
  } catch {
    // Failed to send — drop silently. Don't re-queue (could infinite loop).
  }
}

function log(level: LogLevel, message: string, extras?: Record<string, unknown>, stack?: string) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({
    level,
    message: String(message).slice(0, 2000),
    stack: stack ? String(stack).slice(0, 8000) : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    userId,
    extras,
    timestamp: new Date().toISOString(),
  });
  scheduleFlush();
}

export const logger = {
  error: (msg: string, extras?: Record<string, unknown>, stack?: string) => log('error', msg, extras, stack),
  warn: (msg: string, extras?: Record<string, unknown>) => log('warn', msg, extras),
  info: (msg: string, extras?: Record<string, unknown>) => log('info', msg, extras),
  flush,
};

// Auto-capture window errors + unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    log('error', e.message || 'Unknown error', {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    }, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    log('error', `Unhandled promise rejection: ${reason?.message || reason}`, {
      reason: String(reason).slice(0, 500),
    }, reason?.stack);
  });
  // Flush on page unload
  window.addEventListener('beforeunload', () => flush());
}
