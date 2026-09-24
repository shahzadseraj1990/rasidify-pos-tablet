export const fmt = (n: number): string =>
  (n ?? 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtOrderNo = (n: number | null | undefined): string =>
  n ? '#' + String(n).padStart(4, '0') : '—';

export const fmtDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('en-SA', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtTime = (d: string | Date): string =>
  new Date(d).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (d: string | Date): string =>
  `${fmtDate(d)}  ${fmtTime(d)}`;
