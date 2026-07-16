// ─────────────────────────────────────────────────────────────────────────────
// Cross-page navigation context for ClipAI.
//
// Used to pass payload (e.g. an analysis_id) from one page to another without
// widening the `onNavigate: (page, clips?) => void` signature across every
// page in the app. The sender writes a pending value, the recipient consumes
// it on mount.
//
// Current use-cases:
//   • Dashboard → Viral Forge: re-open a saved analysis by id without re-charging
//     credits. Dashboard's RecentAnalysesWidget calls setPendingAnalysisId(id)
//     + onNavigate('forge'); ViralForgePage reads consumePendingAnalysisId()
//     in a useEffect on mount and fetches /api/analyses/:id.
// ─────────────────────────────────────────────────────────────────────────────

let pendingAnalysisId: string | null = null;

/** Write the analysis id to open on the next Viral Forge mount. */
export function setPendingAnalysisId(id: string | null): void {
  pendingAnalysisId = id;
}

/** Read and clear the pending analysis id (one-shot). */
export function consumePendingAnalysisId(): string | null {
  const id = pendingAnalysisId;
  pendingAnalysisId = null;
  return id;
}

/** Peek without consuming (used for debugging). */
export function peekPendingAnalysisId(): string | null {
  return pendingAnalysisId;
}
