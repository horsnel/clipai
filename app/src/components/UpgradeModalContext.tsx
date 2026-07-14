import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { UpgradeModal } from './UpgradeModal';
import type { UpgradeModalState, UpgradeReason } from './UpgradeModal';
import type { Page } from '../App';

// ─── Context type ──────────────────────────────────────────────────────────
interface UpgradeModalContextValue {
  /** Show the upgrade modal. Use when an action is blocked by credits/plan. */
  showUpgrade: (opts: {
    reason: UpgradeReason;
    requiredCredits?: number;
    currentCredits?: number;
    requiredPlan?: string;
    tool?: string;
  }) => void;
  /** Hide the modal. */
  hideUpgrade: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | undefined>(undefined);

// ─── Provider props ────────────────────────────────────────────────────────
interface UpgradeModalProviderProps {
  children: ReactNode;
  onNavigate: (page: Page) => void;
}

// ─── Provider ──────────────────────────────────────────────────────────────
export function UpgradeModalProvider({ children, onNavigate }: UpgradeModalProviderProps) {
  const [state, setState] = useState<UpgradeModalState>({ open: false, reason: 'no_credits' });

  const showUpgrade = useCallback((opts: {
    reason: UpgradeReason;
    requiredCredits?: number;
    currentCredits?: number;
    requiredPlan?: string;
    tool?: string;
  }) => {
    setState({ open: true, ...opts });
  }, []);

  const hideUpgrade = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  return (
    <UpgradeModalContext.Provider value={{ showUpgrade, hideUpgrade }}>
      {children}
      <UpgradeModal state={state} onClose={hideUpgrade} onNavigate={onNavigate} />
    </UpgradeModalContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (ctx === undefined) {
    throw new Error('useUpgradeModal must be used within an UpgradeModalProvider');
  }
  return ctx;
}
