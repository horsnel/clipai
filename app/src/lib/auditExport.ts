/**
 * auditExport.ts — client-side export utilities for the Channel Audit report.
 *
 * Generates three formats from the audit + insights payload:
 *   1. CSV  — flat tabular spreadsheet (Excel / Google Sheets friendly)
 *   2. DOC  — HTML blob with .doc extension (opens in Microsoft Word / Google Docs)
 *   3. PDF  — print-friendly HTML opened in a new window, user uses browser's
 *             "Save as PDF" (no JS PDF library needed — keeps bundle small)
 *
 * No external dependencies. All generation is client-side.
 */
import type { ChannelAudit, AuditInsights } from '../types';

interface ExportPayload {
  audit: ChannelAudit;
  insights: AuditInsights | null;
  generatedAt?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // Wrap in quotes if it contains a comma, quote, newline, or leading/trailing space
  if (/[",\n\r]|^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(name: string): string {
  return (name || 'channel')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'channel';
}

function formatNum(n: number): string {
  return n?.toLocaleString('en-US') ?? '0';
}

function pct(n: number): string {
  return `${(n ?? 0).toFixed(1)}%`;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
export function exportAuditCSV({ audit, insights, generatedAt }: ExportPayload): void {
  const rows: string[][] = [];
  const date = new Date(generatedAt || Date.now()).toISOString();

  // Header
  rows.push(['ClipAI Channel Audit Report']);
  rows.push(['Generated', date]);
  rows.push([]);

  // Channel info
  rows.push(['Section', 'Field', 'Value']);
  rows.push(['Channel', 'Name', audit.channelName]);
  rows.push(['Channel', 'Handle', audit.channelHandle]);
  rows.push(['Channel', 'Platform', audit.platform]);
  rows.push(['Channel', 'URL', audit.url]);
  rows.push(['Channel', 'Country', audit.country]);
  rows.push(['Channel', 'Description', audit.description]);
  rows.push(['Channel', 'Audited At', audit.auditedAt]);
  rows.push([]);

  // Statistics
  rows.push(['Statistics', 'Subscribers', formatNum(audit.statistics.subscribers)]);
  rows.push(['Statistics', 'Total Views', formatNum(audit.statistics.totalViews)]);
  rows.push(['Statistics', 'Video Count', formatNum(audit.statistics.videoCount)]);
  rows.push(['Statistics', 'Hidden Subscriber Count', audit.statistics.hiddenSubscriberCount ? 'Yes' : 'No']);
  rows.push([]);

  // Metrics
  rows.push(['Metrics', 'Avg Recent Views', formatNum(audit.metrics.avgRecentViews)]);
  rows.push(['Metrics', 'Total Recent Views', formatNum(audit.metrics.totalRecentViews)]);
  rows.push(['Metrics', 'Avg Engagement Rate', pct(audit.metrics.avgEngagementRate)]);
  rows.push(['Metrics', 'Recent Video Count', formatNum(audit.metrics.recentVideoCount)]);
  rows.push([]);

  // Insights (if available)
  if (insights) {
    rows.push(['Insights', 'Health Score', String(insights.healthScore)]);
    rows.push(['Insights', 'Health Label', insights.healthLabel]);
    rows.push(['Insights', 'Executive Summary', insights.executiveSummary]);
    rows.push(['Insights', 'Engagement Trend', insights.engagementTrend.direction]);
    rows.push(['Insights', 'Engagement Analysis', insights.engagementTrend.analysis]);
    rows.push(['Insights', 'Posting Cadence', insights.postingCadence.currentPattern]);
    rows.push(['Insights', 'Optimal Frequency', insights.postingCadence.optimalFrequency]);
    rows.push([]);

    // Best performing videos
    rows.push(['Best Performing Videos', 'Title', 'Views', 'Likes', 'Comments', 'Why It Worked', 'Replication Tip']);
    insights.bestPerformingVideos.forEach((v, i) => {
      rows.push([
        `#${i + 1}`,
        v.title,
        formatNum(v.views),
        formatNum(v.likes),
        formatNum(v.comments),
        v.whyItWorked,
        v.replicationTip,
      ]);
    });
    rows.push([]);

    // Worst performing videos
    rows.push(['Worst Performing Videos', 'Title', 'Views', 'Likes', 'Comments', 'Why Underperformed', 'Fix Tip']);
    insights.worstPerformingVideos.forEach((v, i) => {
      rows.push([
        `#${i + 1}`,
        v.title,
        formatNum(v.views),
        formatNum(v.likes),
        formatNum(v.comments),
        v.whyItUnderperformed,
        v.fixTip,
      ]);
    });
    rows.push([]);

    // SWOT
    rows.push(['SWOT', 'Strengths', insights.swot.strengths.join('; ')]);
    rows.push(['SWOT', 'Weaknesses', insights.swot.weaknesses.join('; ')]);
    rows.push(['SWOT', 'Opportunities', insights.swot.opportunities.join('; ')]);
    rows.push(['SWOT', 'Threats', insights.swot.threats.join('; ')]);
    rows.push([]);

    // Content themes
    rows.push(['Content Themes', 'Theme', 'Frequency', 'Performance']);
    insights.contentThemes.forEach((t) => {
      rows.push(['', t.theme, t.frequency, t.performance]);
    });
    rows.push([]);

    // Recommendations
    rows.push(['Recommendations', 'Priority', 'Category', 'Title', 'Description', 'Expected Impact']);
    insights.recommendations.forEach((r) => {
      rows.push(['', r.priority, r.category, r.title, r.description, r.expectedImpact]);
    });
    rows.push([]);

    // Growth opportunities
    rows.push(['Growth Opportunities', 'Opportunity', 'Effort', 'Impact', 'Rationale']);
    insights.growthOpportunities.forEach((g) => {
      rows.push(['', g.opportunity, g.effort, g.impact, g.rationale]);
    });
    rows.push([]);

    // Content gaps
    rows.push(['Content Gaps', 'Gap', 'Suggestion']);
    insights.contentGaps.forEach((g) => {
      rows.push(['', g.gap, g.suggestion]);
    });
    rows.push([]);

    // Next steps
    rows.push(['Next Steps', 'Step']);
    insights.nextSteps.forEach((s, i) => {
      rows.push([`#${i + 1}`, s]);
    });
    rows.push([]);
  }

  // Recent videos
  if (audit.recentVideos?.length) {
    rows.push(['Recent Videos', 'Title', 'Views', 'Likes', 'Comments', 'Published At', 'URL']);
    audit.recentVideos.forEach((v) => {
      rows.push([
        '',
        v.title,
        formatNum(v.viewCount),
        formatNum(v.likeCount),
        formatNum(v.commentCount),
        v.publishedAt,
        v.url,
      ]);
    });
  }

  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const bom = '\uFEFF'; // UTF-8 BOM so Excel reads Unicode correctly
  downloadBlob(bom + csv, `${safeFilename(audit.channelName)}_audit.csv`, 'text/csv;charset=utf-8');
}

// ─── DOC (HTML blob with .doc extension) ─────────────────────────────────────
export function exportAuditDOC({ audit, insights, generatedAt }: ExportPayload): void {
  const date = new Date(generatedAt || Date.now()).toLocaleString();
  const html = buildReportHTML(audit, insights, date);
  // Word opens HTML with .doc extension natively (no conversion needed)
  downloadBlob(html, `${safeFilename(audit.channelName)}_audit.doc`, 'application/msword');
}

// ─── PDF (print-friendly new window) ─────────────────────────────────────────
export function exportAuditPDF({ audit, insights, generatedAt }: ExportPayload): void {
  const date = new Date(generatedAt || Date.now()).toLocaleString();
  const html = buildReportHTML(audit, insights, date, /* forPrint */ true);
  // Open in a new window and trigger the print dialog. The user picks
  // "Save as PDF" as the destination. This avoids bundling jsPDF + html2canvas
  // (~250 KB) just for an occasional export.
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    alert('Please allow pop-ups to export the report as PDF.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new window a moment to render before triggering print
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}

// ─── shared HTML report builder ──────────────────────────────────────────────
function buildReportHTML(audit: ChannelAudit, insights: AuditInsights | null, dateStr: string, forPrint = false): string {
  const accent = '#07D2DF';
  const dark = '#0A0A0A';
  const surface = '#121212';
  const text = '#F0F0F0';
  const muted = '#B0B0B0';
  const border = '#2A2A2A';

  const sections: string[] = [];

  // ── Header ──
  sections.push(`
    <div style="border-bottom:3px solid ${accent};padding-bottom:16px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:2px;color:${accent};font-weight:700;text-transform:uppercase;">ClipAI Channel Audit Report</div>
      <h1 style="font-size:32px;margin:8px 0 4px;color:${text};">${escapeHTML(audit.channelName)}</h1>
      <div style="color:${muted};font-size:14px;">
        @${escapeHTML(audit.channelHandle)} · ${audit.platform.toUpperCase()} · Generated ${dateStr}
      </div>
      <div style="margin-top:8px;">
        <a href="${escapeAttr(audit.url)}" style="color:${accent};text-decoration:none;font-size:13px;">${escapeHTML(audit.url)}</a>
      </div>
    </div>
  `);

  // ── Statistics grid ──
  if (!audit.statistics.hiddenSubscriberCount) {
    sections.push(`
      <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Channel Statistics</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:12px;background:${surface};border:1px solid ${border};width:25%;"><div style="color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;">Subscribers</div><div style="color:${text};font-size:22px;font-weight:700;margin-top:4px;">${formatNum(audit.statistics.subscribers)}</div></td>
          <td style="padding:12px;background:${surface};border:1px solid ${border};width:25%;"><div style="color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;">Total Views</div><div style="color:${text};font-size:22px;font-weight:700;margin-top:4px;">${formatNum(audit.statistics.totalViews)}</div></td>
          <td style="padding:12px;background:${surface};border:1px solid ${border};width:25%;"><div style="color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;">Video Count</div><div style="color:${text};font-size:22px;font-weight:700;margin-top:4px;">${formatNum(audit.statistics.videoCount)}</div></td>
          <td style="padding:12px;background:${surface};border:1px solid ${border};width:25%;"><div style="color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;">Avg Engagement</div><div style="color:${text};font-size:22px;font-weight:700;margin-top:4px;">${pct(audit.metrics.avgEngagementRate)}</div></td>
        </tr>
      </table>
    `);
  }

  // ── Insights (if available) ──
  if (insights) {
    // Health score + executive summary
    sections.push(`
      <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">AI Executive Summary</h2>
      <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:24px;">
        <div style="text-align:center;flex-shrink:0;">
          <div style="width:96px;height:96px;border-radius:50%;border:6px solid ${border};display:flex;align-items:center;justify-content:center;flex-direction:column;background:${surface};">
            <div style="font-size:32px;font-weight:800;color:${accent};line-height:1;">${insights.healthScore}</div>
            <div style="font-size:10px;color:${muted};text-transform:uppercase;letter-spacing:1px;">/ 100</div>
          </div>
          <div style="margin-top:8px;font-weight:700;color:${accent};font-size:13px;">${escapeHTML(insights.healthLabel)}</div>
        </div>
        <div style="flex:1;color:${text};font-size:14px;line-height:1.6;">${escapeHTML(insights.executiveSummary)}</div>
      </div>
    `);

    // SWOT
    sections.push(`
      <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">SWOT Analysis</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:16px;background:${surface};border:1px solid ${border};width:50%;vertical-align:top;"><div style="color:#4ADE80;font-weight:700;margin-bottom:8px;font-size:14px;">Strengths</div><ul style="margin:0;padding-left:18px;color:${text};font-size:13px;line-height:1.6;">${insights.swot.strengths.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul></td>
          <td style="padding:16px;background:${surface};border:1px solid ${border};width:50%;vertical-align:top;"><div style="color:#FF4444;font-weight:700;margin-bottom:8px;font-size:14px;">Weaknesses</div><ul style="margin:0;padding-left:18px;color:${text};font-size:13px;line-height:1.6;">${insights.swot.weaknesses.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul></td>
        </tr>
        <tr>
          <td style="padding:16px;background:${surface};border:1px solid ${border};vertical-align:top;"><div style="color:${accent};font-weight:700;margin-bottom:8px;font-size:14px;">Opportunities</div><ul style="margin:0;padding-left:18px;color:${text};font-size:13px;line-height:1.6;">${insights.swot.opportunities.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul></td>
          <td style="padding:16px;background:${surface};border:1px solid ${border};vertical-align:top;"><div style="color:#FF9500;font-weight:700;margin-bottom:8px;font-size:14px;">Threats</div><ul style="margin:0;padding-left:18px;color:${text};font-size:13px;line-height:1.6;">${insights.swot.threats.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul></td>
        </tr>
      </table>
    `);

    // Recommendations
    if (insights.recommendations.length) {
      const priorityColor: Record<string, string> = {
        high: '#FF4444', medium: '#FF9500', low: '#888888',
      };
      sections.push(`
        <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Recommendations</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          ${insights.recommendations.map(r => `
            <tr>
              <td style="padding:12px;background:${surface};border:1px solid ${border};width:90px;vertical-align:top;">
                <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:${priorityColor[r.priority] || '#888'}22;color:${priorityColor[r.priority] || '#888'};border:1px solid ${priorityColor[r.priority] || '#888'}66;">${escapeHTML(r.priority)}</span>
                <div style="margin-top:6px;font-size:10px;color:${muted};text-transform:uppercase;letter-spacing:1px;">${escapeHTML(r.category)}</div>
              </td>
              <td style="padding:12px;background:${surface};border:1px solid ${border};vertical-align:top;">
                <div style="font-weight:700;color:${text};font-size:14px;margin-bottom:4px;">${escapeHTML(r.title)}</div>
                <div style="color:${text};font-size:13px;line-height:1.5;margin-bottom:6px;">${escapeHTML(r.description)}</div>
                ${r.expectedImpact ? `<div style="color:${accent};font-size:12px;">⚡ ${escapeHTML(r.expectedImpact)}</div>` : ''}
              </td>
            </tr>
          `).join('')}
        </table>
      `);
    }

    // Best performing videos
    if (insights.bestPerformingVideos.length) {
      sections.push(`
        <h2 style="color:#4ADE80;font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Best Performing Videos</h2>
        ${insights.bestPerformingVideos.map((v, i) => `
          <div style="padding:14px;background:${surface};border:1px solid ${border};border-left:3px solid #4ADE80;margin-bottom:12px;">
            <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:6px;">
              <span style="color:#4ADE80;font-weight:700;font-size:13px;">#${i + 1}</span>
              <span style="color:${text};font-weight:600;font-size:14px;flex:1;">${escapeHTML(v.title)}</span>
            </div>
            <div style="color:${muted};font-size:12px;margin-bottom:8px;">${formatNum(v.views)} views · ${formatNum(v.likes)} likes · ${formatNum(v.comments)} comments</div>
            <div style="color:${text};font-size:13px;line-height:1.5;margin-bottom:6px;"><strong style="color:#4ADE80;">Why it worked:</strong> ${escapeHTML(v.whyItWorked)}</div>
            <div style="color:${text};font-size:13px;line-height:1.5;"><strong style="color:${accent};">Replication tip:</strong> ${escapeHTML(v.replicationTip)}</div>
          </div>
        `).join('')}
      `);
    }

    // Growth opportunities
    if (insights.growthOpportunities.length) {
      sections.push(`
        <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Growth Opportunities</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr style="background:${surface};">
            <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;">Opportunity</th>
            <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;width:80px;">Effort</th>
            <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;width:80px;">Impact</th>
            <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;">Rationale</th>
          </tr>
          ${insights.growthOpportunities.map(g => `
            <tr>
              <td style="padding:10px;background:${surface};border:1px solid ${border};color:${text};font-size:13px;font-weight:600;">${escapeHTML(g.opportunity)}</td>
              <td style="padding:10px;background:${surface};border:1px solid ${border};color:${text};font-size:12px;text-transform:capitalize;text-align:center;">${escapeHTML(g.effort)}</td>
              <td style="padding:10px;background:${surface};border:1px solid ${border};color:${text};font-size:12px;text-transform:capitalize;text-align:center;">${escapeHTML(g.impact)}</td>
              <td style="padding:10px;background:${surface};border:1px solid ${border};color:${muted};font-size:12px;">${escapeHTML(g.rationale)}</td>
            </tr>
          `).join('')}
        </table>
      `);
    }

    // Content gaps
    if (insights.contentGaps.length) {
      sections.push(`
        <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Content Gaps to Fill</h2>
        ${insights.contentGaps.map(g => `
          <div style="padding:12px;background:${surface};border:1px solid ${border};margin-bottom:8px;">
            <div style="color:${text};font-size:13px;font-weight:600;margin-bottom:4px;">${escapeHTML(g.gap)}</div>
            <div style="color:${muted};font-size:12px;line-height:1.5;">→ ${escapeHTML(g.suggestion)}</div>
          </div>
        `).join('')}
      `);
    }

    // Next steps
    if (insights.nextSteps.length) {
      sections.push(`
        <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Your Next Steps This Week</h2>
        <ol style="margin:0 0 24px;padding-left:24px;color:${text};font-size:14px;line-height:1.8;">
          ${insights.nextSteps.map(s => `<li style="margin-bottom:6px;">${escapeHTML(s)}</li>`).join('')}
        </ol>
      `);
    }
  }

  // ── Recent videos ──
  if (audit.recentVideos?.length) {
    sections.push(`
      <h2 style="color:${accent};font-size:18px;margin:24px 0 12px;border-bottom:1px solid ${border};padding-bottom:6px;">Recent Videos (${audit.recentVideos.length})</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:${surface};">
          <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:left;">Title</th>
          <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;width:90px;">Views</th>
          <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;width:80px;">Likes</th>
          <th style="padding:8px;border:1px solid ${border};color:${muted};font-size:11px;text-transform:uppercase;letter-spacing:1px;width:90px;">Comments</th>
        </tr>
        ${audit.recentVideos.map(v => `
          <tr>
            <td style="padding:8px;background:${surface};border:1px solid ${border};color:${text};font-size:13px;"><a href="${escapeAttr(v.url)}" style="color:${text};text-decoration:none;">${escapeHTML(v.title)}</a></td>
            <td style="padding:8px;background:${surface};border:1px solid ${border};color:${text};font-size:12px;text-align:right;">${formatNum(v.viewCount)}</td>
            <td style="padding:8px;background:${surface};border:1px solid ${border};color:${text};font-size:12px;text-align:right;">${formatNum(v.likeCount)}</td>
            <td style="padding:8px;background:${surface};border:1px solid ${border};color:${text};font-size:12px;text-align:right;">${formatNum(v.commentCount)}</td>
          </tr>
        `).join('')}
      </table>
    `);
  }

  // Footer
  sections.push(`
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${border};color:${muted};font-size:11px;text-align:center;">
      Generated by ClipAI · ${dateStr} · clipai-bqo.pages.dev
    </div>
  `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHTML(audit.channelName)} — Channel Audit Report</title>
${forPrint ? `<style>
  @page { margin: 16mm; size: A4; }
  body { background: ${dark} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>` : ''}
<style>
  body { background: ${dark}; color: ${text}; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; margin: 0; }
  h1, h2 { font-family: 'Sora', 'Inter', sans-serif; }
  a { color: ${accent}; }
  table { page-break-inside: avoid; }
</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
}

// ─── HTML escape helpers ─────────────────────────────────────────────────────
function escapeHTML(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: unknown): string {
  return escapeHTML(s);
}
