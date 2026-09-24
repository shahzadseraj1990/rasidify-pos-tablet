/**
 * Pure ESC/POS command builder (no native dependencies).
 * Produces a string of raw ESC/POS bytes that can be sent to any thermal printer.
 * Paper widths: 80mm = 42 chars, 58mm = 32 chars at standard 12 cpi.
 */

// ── ESC/POS control codes ──────────────────────────────────────────────────
const ESC = '\x1b';
const GS  = '\x1d';
const LF  = '\x0a';

const CMD = {
  INIT:          `${ESC}@`,
  ALIGN_LEFT:    `${ESC}a\x00`,
  ALIGN_CENTER:  `${ESC}a\x01`,
  ALIGN_RIGHT:   `${ESC}a\x02`,
  BOLD_ON:       `${ESC}E\x01`,
  BOLD_OFF:      `${ESC}E\x00`,
  SIZE_NORMAL:   `${ESC}!\x00`,
  SIZE_DH:       `${ESC}!\x10`,   // double height
  SIZE_DW:       `${ESC}!\x20`,   // double width
  SIZE_DWDH:     `${ESC}!\x30`,   // double width + height (x2 size)
  UNDERLINE_ON:  `${ESC}-\x01`,
  UNDERLINE_OFF: `${ESC}-\x00`,
  FONT_A:        `${ESC}M\x00`,   // standard font
  FONT_B:        `${ESC}M\x01`,   // smaller font
  CUT:           `${GS}V\x41\x03`, // full cut + 3-line feed
};

export class EscPosBuilder {
  private parts: string[] = [];
  private readonly cols: number;

  /** @param paperWidth 58 (32 cols) or 80 (42 cols) */
  constructor(paperWidth: 58 | 80 = 80) {
    this.cols = paperWidth === 58 ? 32 : 42;
    this.parts.push(CMD.INIT);
  }

  get columns() { return this.cols; }

  // ── Alignment ──────────────────────────────────────────────────────────

  left():   this { this.parts.push(CMD.ALIGN_LEFT);   return this; }
  center(): this { this.parts.push(CMD.ALIGN_CENTER); return this; }
  right():  this { this.parts.push(CMD.ALIGN_RIGHT);  return this; }

  // ── Text style ─────────────────────────────────────────────────────────

  bold(on: boolean): this {
    this.parts.push(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
    return this;
  }

  underline(on: boolean): this {
    this.parts.push(on ? CMD.UNDERLINE_ON : CMD.UNDERLINE_OFF);
    return this;
  }

  /** size: 'normal' | 'dh' (double height) | 'dw' (double width) | 'xl' (2x) */
  size(s: 'normal' | 'dh' | 'dw' | 'xl'): this {
    const map = { normal: CMD.SIZE_NORMAL, dh: CMD.SIZE_DH, dw: CMD.SIZE_DW, xl: CMD.SIZE_DWDH };
    this.parts.push(map[s]);
    return this;
  }

  font(f: 'A' | 'B'): this {
    this.parts.push(f === 'B' ? CMD.FONT_B : CMD.FONT_A);
    return this;
  }

  // ── Content ────────────────────────────────────────────────────────────

  /** Append raw text (no newline). */
  text(str: string): this {
    this.parts.push(str);
    return this;
  }

  /** Append a pre-built ESC/POS raster-image command string (see ImageToEscPos.ts). */
  raster(command: string): this {
    this.parts.push(command);
    return this;
  }

  /** Append text + LF. */
  line(str: string = ''): this {
    this.parts.push(str + LF);
    return this;
  }

  /** Feed N blank lines. */
  feed(n: number = 1): this {
    this.parts.push(LF.repeat(n));
    return this;
  }

  /**
   * Draw a horizontal separator line.
   * After this call alignment/style is reset to left/normal.
   */
  separator(char = '-'): this {
    this.left().size('normal').bold(false);
    this.parts.push(char.repeat(this.cols) + LF);
    return this;
  }

  /**
   * Print a two-column row: left text and right text.
   * Left gets remaining space, right is fixed width.
   */
  row2(left: string, right: string, rightWidth = 12): this {
    const leftWidth = this.cols - rightWidth - 1;
    const l = this._truncate(left, leftWidth).padEnd(leftWidth);
    const r = right.padStart(rightWidth);
    this.parts.push(l + ' ' + r + LF);
    return this;
  }

  /**
   * Print a three-column row (qty | name | amount) for detailed template.
   * widths must sum to this.cols.
   */
  row3(c1: string, c2: string, c3: string, w1: number, w3: number): this {
    const w2 = this.cols - w1 - w3 - 2; // 2 separating spaces
    const col1 = this._truncate(c1, w1).padEnd(w1);
    const col2 = this._truncate(c2, w2).padEnd(w2);
    const col3 = this._truncate(c3, w3).padStart(w3);
    this.parts.push(`${col1} ${col2} ${col3}${LF}`);
    return this;
  }

  /** Center a string within the paper width (used for large order#). */
  centeredLine(str: string): this {
    const pad = Math.max(0, Math.floor((this.cols - str.length) / 2));
    this.parts.push(' '.repeat(pad) + str + LF);
    return this;
  }

  /** Full paper cut. */
  cut(): this {
    this.parts.push(CMD.CUT);
    return this;
  }

  /** Return the complete ESC/POS byte string. */
  build(): string {
    // Reset styles before cut
    this.parts.push(CMD.SIZE_NORMAL + CMD.BOLD_OFF + CMD.ALIGN_LEFT);
    return this.parts.join('');
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private _truncate(str: string, max: number): string {
    if (!str) return '';
    return str.length > max ? str.substring(0, max - 1) + '…' : str;
  }
}
