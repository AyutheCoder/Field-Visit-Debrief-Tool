import type { ActionItem, Blocker, FollowUp, SentimentLabel, VisitWithRelations } from '../types';
import { regionOf } from './dashboard';

// --- CSV export (dependency-free) ---

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  // Quote if the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

const COLUMNS = [
  'Visit ID',
  'Date',
  'Location',
  'Region',
  'Program',
  'Visit type',
  'Sentiment',
  'Key findings',
  'Blockers',
  'Open actions',
  'Stakeholders',
];

/** Flatten visits (with debriefs) into a CSV string. */
export function visitsToCsv(visits: VisitWithRelations[]): string {
  const lines = [csvRow(COLUMNS)];
  for (const v of visits) {
    const d = v.debrief;
    const openActions = (d?.actionItems ?? []).filter((a: any) => a.status !== 'done').length;
    lines.push(
      csvRow([
        v.id,
        new Date(v.visitDate).toISOString().slice(0, 10),
        v.locationName,
        regionOf(v.locationName),
        v.programArea,
        v.visitType ?? '',
        d?.sentimentLabel ?? '',
        (d?.keyFindings ?? []).join(' | '),
        (d?.blockers ?? []).map((b: any) => `${b.category}: ${b.issue}`).join(' | '),
        openActions,
        v.stakeholders.map((s: any) => s.name).join(' | '),
      ])
    );
  }
  return lines.join('\r\n');
}

/** Trigger a browser download for arbitrary text content. */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export visits as a downloadable CSV file. */
export function exportVisitsCsv(visits: VisitWithRelations[]): void {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`field-visits-${stamp}.csv`, visitsToCsv(visits), 'text/csv;charset=utf-8');
}

// --- PDF debrief (via the browser's print-to-PDF) ---

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c: any) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c as string] ?? c));
}

function list(items: string[]): string {
  if (!items.length) return '<p class="muted">None recorded.</p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

/** The debrief fields needed to render a printable PDF. */
export interface PrintableDebrief {
  keyFindings: string[];
  blockers: Blocker[];
  sentimentLabel: SentimentLabel | null;
  sentimentScore: number | null;
  followUps: FollowUp[];
  actionItems?: ActionItem[];
  aiModel?: string | null;
}

/** Open a printable debrief in a new window and invoke the print dialog. */
export function printDebrief(visit: VisitWithRelations, override?: PrintableDebrief): void {
  const d = override ?? visit.debrief;
  const sentiment = d?.sentimentLabel ? `${d.sentimentLabel} (${(d.sentimentScore ?? 0).toFixed(2)})` : 'unknown';
  const findings = d?.keyFindings ?? [];
  const blockers = (d?.blockers ?? []).map((b: any) => `${b.category}: ${b.issue}`);
  const followUps = (d?.followUps ?? []).map((f: any) => `[${f.priority}] ${f.action}`);

  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Debrief - ${esc(visit.locationName)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #111827; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 32px; margin-bottom: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; margin-bottom: 32px; }
    .grid span { color: #6b7280; font-weight: 500; }
    ul { margin: 0; padding-left: 20px; font-size: 14px; }
    li { margin-bottom: 6px; }
    .muted { color: #9ca3af; font-style: italic; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <h1>Field Visit Debrief</h1>
  <div class="meta">${esc(visit.locationName)} · ${esc(regionOf(visit.locationName))}</div>
  <div class="grid">
    <div><span>Date:</span> ${new Date(visit.visitDate).toLocaleDateString()}</div>
    <div><span>Program:</span> ${esc(visit.programArea)}</div>
    <div><span>Visit type:</span> ${esc(visit.visitType ?? '-')}</div>
    <div><span>Sentiment:</span> ${esc(sentiment)}</div>
  </div>

  <h2>Key findings</h2>
  ${list(findings)}

  <h2>Blockers</h2>
  ${list(blockers)}

  <h2>Follow-up actions</h2>
  ${list(followUps)}

  <h2>Stakeholders</h2>
  ${list(visit.stakeholders.map((s: any) => `${s.name}${s.role ? ` - ${s.role}` : ''}${s.organization ? ` (${s.organization})` : ''}`))}

  <div class="footer">
    Generated ${new Date().toLocaleString()}${d?.aiModel ? ` · model: ${esc(d.aiModel)}` : ''}
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
