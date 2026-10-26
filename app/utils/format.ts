export const fmt = (n: number): string =>
  (n ?? 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Round money to 2 decimals, half up, the same way fmt() displays it. A plain
// Math.round(n * 100) / 100 gets values like 4.5 × 1.15 = 5.17499999… wrong
// (→ 5.17 while the screen shows 5.18), so round from the 12-digit decimal
// string instead of the binary float.
export const roundMoney = (n: number): number =>
  Number(Math.round(Number(`${(n ?? 0).toPrecision(12)}e2`)) + 'e-2');

export const fmtOrderNo = (n: number | null | undefined): string =>
  n ? '#' + String(n).padStart(4, '0') : '—';

export const fmtDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('en-SA', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtTime = (d: string | Date): string =>
  new Date(d).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (d: string | Date): string =>
  `${fmtDate(d)}  ${fmtTime(d)}`;
