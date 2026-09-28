// A minimal PDF writer.
//
// This exists instead of a PDF library because the whole job here is a few
// hundred vector operations — lines, rounded boxes, bezier connectors and
// Helvetica text — and every library that does that arrives as a third of a
// megabyte. The output is vector, so a map stays sharp at any zoom on an
// iPad, and the file is a handful of KB rather than a screenshot.
//
// Coordinates are top-left origin with y growing DOWN, because that is how
// the mind-map layout already thinks. PDF's own origin is bottom-left, so
// every y is flipped once, at the moment it is emitted, and nowhere else.
//
// Text is Helvetica/Helvetica-Bold with WinAnsiEncoding — the two fonts every
// reader has built in, so nothing is embedded. That caps the character set at
// WinAnsi: ASCII plus the Latin-1 accented range. Greek letters and arrows do
// turn up in medical notes, so they are transliterated (alpha, ->) rather
// than dropped; anything still outside the encoding becomes '?'. Embedding a
// Unicode font would fix that at the cost of ~100KB of subsetting code, which
// is not worth it until a real note actually needs it.

export type RGB = [number, number, number];

/** Glyph advance widths (units per 1000) for ASCII 32..126. Taken from the
 *  Adobe AFM metrics for the two base-14 fonts we use. Anything outside the
 *  range falls back to 556, which is the width of a digit — close enough for
 *  the accented characters that are the only other things we emit. */
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Characters that are not in WinAnsi but show up often enough in lecture
 *  notes that turning them into '?' would be worse than spelling them out. */
const TRANSLITERATE: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '…': '...', '•': '-',
  '→': '->', '←': '<-', '↑': 'up', '↓': 'down',
  '↔': '<->', '⇒': '=>', '≥': '>=', '≤': '<=',
  '≠': '!=', '≈': '~', '×': 'x', '÷': '/',
  '√': 'sqrt', '∞': 'inf', '∆': 'delta', '∑': 'sum',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta',
  'ε': 'epsilon', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'micro',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau',
  'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
  'Δ': 'delta', 'Ω': 'ohm', '✓': 'x', '✗': 'x',
  '′': "'", '″': '"', ' ': ' ',
  // WinAnsi has these, but they sit in 0x80-0x9F where it diverges from
  // Latin-1, and the passthrough above deliberately covers only the range
  // where the two agree. Cheaper to spell them than to special-case it.
  '›': '>', '‹': '<', '€': 'EUR', '™': '(TM)', 'Š': 'S', 'Ž': 'Z',
};

/** Fold a string down to what WinAnsiEncoding can actually render. */
export function toWinAnsi(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    // ASCII printable, or the Latin-1 supplement (which WinAnsi matches).
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) {
      out += ch;
      continue;
    }
    const sub = TRANSLITERATE[ch];
    out += sub !== undefined ? sub : c === 0x09 ? ' ' : '?';
  }
  return out;
}

function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 100) / 100).toString();
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
}

export interface StrokeOptions {
  color?: RGB;
  width?: number;
  /** [on, off] pattern in points. */
  dash?: [number, number];
}

export class PdfBuilder {
  readonly pageW: number;
  readonly pageH: number;
  private pages: string[] = [];
  private cur: string[] = [];

  constructor(pageW: number, pageH: number) {
    this.pageW = pageW;
    this.pageH = pageH;
  }

  /** Finish the current page and begin a new one. */
  addPage(): void {
    this.pages.push(this.cur.join('\n'));
    this.cur = [];
  }

  get pageCount(): number {
    return this.pages.length + 1;
  }

  /** Advance width of `s` at `size`, in points. */
  widthOf(s: string, size: number, bold = false): number {
    const table = bold ? W_BOLD : W_REGULAR;
    const text = toWinAnsi(s);
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      total += c >= 32 && c <= 126 ? table[c - 32] : 556;
    }
    return (total * size) / 1000;
  }

  /** Truncate with an ellipsis so the result fits inside `maxWidth`. */
  fit(s: string, maxWidth: number, size: number, bold = false): string {
    if (this.widthOf(s, size, bold) <= maxWidth) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.widthOf(s.slice(0, mid) + '...', size, bold) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + '...';
  }

  /** Greedy word wrap into lines no wider than `maxWidth`. */
  wrap(s: string, maxWidth: number, size: number, bold = false): string[] {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (this.widthOf(next, size, bold) <= maxWidth) line = next;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  /** `y` is the text baseline, measured down from the top of the page. */
  text(s: string, x: number, y: number, opts: TextOptions = {}): void {
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    const [r, g, b] = opts.color ?? [0, 0, 0];
    let tx = x;
    if (opts.align === 'center') tx = x - this.widthOf(s, size, bold) / 2;
    else if (opts.align === 'right') tx = x - this.widthOf(s, size, bold);
    this.cur.push(
      `BT ${num(r)} ${num(g)} ${num(b)} rg /${bold ? 'F2' : 'F1'} ${num(size)} Tf ` +
        `${num(tx)} ${num(this.pageH - y)} Td (${esc(toWinAnsi(s))}) Tj ET`
    );
  }

  private applyStroke(o: StrokeOptions): void {
    const [r, g, b] = o.color ?? [0, 0, 0];
    this.cur.push(`${num(r)} ${num(g)} ${num(b)} RG ${num(o.width ?? 1)} w`);
    this.cur.push(o.dash ? `[${num(o.dash[0])} ${num(o.dash[1])}] 0 d` : '[] 0 d');
  }

  line(x1: number, y1: number, x2: number, y2: number, o: StrokeOptions = {}): void {
    this.cur.push('q');
    this.applyStroke(o);
    this.cur.push(
      `${num(x1)} ${num(this.pageH - y1)} m ${num(x2)} ${num(this.pageH - y2)} l S`
    );
    this.cur.push('Q');
  }

  /** Cubic bezier, used for the curved branch connectors. */
  curve(
    x1: number, y1: number, cx1: number, cy1: number,
    cx2: number, cy2: number, x2: number, y2: number,
    o: StrokeOptions = {}
  ): void {
    this.cur.push('q');
    this.applyStroke(o);
    this.cur.push(
      `${num(x1)} ${num(this.pageH - y1)} m ` +
        `${num(cx1)} ${num(this.pageH - cy1)} ${num(cx2)} ${num(this.pageH - cy2)} ` +
        `${num(x2)} ${num(this.pageH - y2)} c S`
    );
    this.cur.push('Q');
  }

  rect(
    x: number, y: number, w: number, h: number,
    o: StrokeOptions & { fill?: RGB; radius?: number } = {}
  ): void {
    const r = Math.min(o.radius ?? 0, w / 2, h / 2);
    this.cur.push('q');
    this.applyStroke(o);
    if (o.fill) this.cur.push(`${num(o.fill[0])} ${num(o.fill[1])} ${num(o.fill[2])} rg`);
    const b = this.pageH - y;      // top edge in PDF space
    const bot = this.pageH - y - h;
    if (r <= 0) {
      this.cur.push(`${num(x)} ${num(bot)} ${num(w)} ${num(h)} re`);
    } else {
      const k = r * 0.5523;
      this.cur.push(
        `${num(x + r)} ${num(b)} m ` +
          `${num(x + w - r)} ${num(b)} l ` +
          `${num(x + w - r + k)} ${num(b)} ${num(x + w)} ${num(b - r + k)} ${num(x + w)} ${num(b - r)} c ` +
          `${num(x + w)} ${num(bot + r)} l ` +
          `${num(x + w)} ${num(bot + r - k)} ${num(x + w - r + k)} ${num(bot)} ${num(x + w - r)} ${num(bot)} c ` +
          `${num(x + r)} ${num(bot)} l ` +
          `${num(x + r - k)} ${num(bot)} ${num(x)} ${num(bot + r - k)} ${num(x)} ${num(bot + r)} c ` +
          `${num(x)} ${num(b - r)} l ` +
          `${num(x)} ${num(b - r + k)} ${num(x + r - k)} ${num(b)} ${num(x + r)} ${num(b)} c h`
      );
    }
    const painted = o.fill ? (o.color ? 'B' : 'f') : 'S';
    this.cur.push(painted);
    this.cur.push('Q');
  }

  /** Small filled circle — the dot-grid guide and the branch bullets. */
  dot(x: number, y: number, r: number, color: RGB): void {
    const k = r * 0.5523;
    const cy = this.pageH - y;
    this.cur.push('q');
    this.cur.push(`${num(color[0])} ${num(color[1])} ${num(color[2])} rg`);
    this.cur.push(
      `${num(x - r)} ${num(cy)} m ` +
        `${num(x - r)} ${num(cy + k)} ${num(x - k)} ${num(cy + r)} ${num(x)} ${num(cy + r)} c ` +
        `${num(x + k)} ${num(cy + r)} ${num(x + r)} ${num(cy + k)} ${num(x + r)} ${num(cy)} c ` +
        `${num(x + r)} ${num(cy - k)} ${num(x + k)} ${num(cy - r)} ${num(x)} ${num(cy - r)} c ` +
        `${num(x - k)} ${num(cy - r)} ${num(x - r)} ${num(cy - k)} ${num(x - r)} ${num(cy)} c h f`
    );
    this.cur.push('Q');
  }

  /** Many dots at once. A dot grid is thousands of marks, and emitting each
   *  as four beziers made the file ten times bigger than the page deserves.
   *  A zero-length line with a round cap is one operator and paints the same
   *  circle. */
  dots(points: [number, number][], r: number, color: RGB): void {
    if (points.length === 0) return;
    this.cur.push('q');
    this.cur.push(`${num(color[0])} ${num(color[1])} ${num(color[2])} RG ${num(r * 2)} w 1 J`);
    for (const [x, y] of points) {
      const py = this.pageH - y;
      this.cur.push(`${num(x)} ${num(py)} m ${num(x)} ${num(py)} l`);
    }
    this.cur.push('S');
    this.cur.push('Q');
  }

  /** Serialise the whole document. Object offsets are counted in BYTES, not
   *  characters, which is why the body is assembled as Latin-1 bytes first. */
  private bytes(): Uint8Array {
    const pages = [...this.pages, this.cur.join('\n')];
    const n = pages.length;

    // 1 catalog, 2 pages tree, 3..3+n-1 page objects, then n content streams,
    // then the two fonts.
    const firstPage = 3;
    const firstContent = firstPage + n;
    const fontRegular = firstContent + n;
    const fontBold = fontRegular + 1;
    const total = fontBold;

    const objs: string[] = [];
    objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    objs.push(
      `<< /Type /Pages /Kids [${pages
        .map((_, i) => `${firstPage + i} 0 R`)
        .join(' ')}] /Count ${n} >>`
    );
    for (let i = 0; i < n; i++) {
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.pageW)} ${num(this.pageH)}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
          `/Contents ${firstContent + i} 0 R >>`
      );
    }
    for (const body of pages) {
      objs.push(`<< /Length ${latin1Length(body)} >>\nstream\n${body}\nendstream`);
    }
    objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(latin1Length(out));
      out += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = latin1Length(out);
    out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += `${off.toString().padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const buf = new Uint8Array(latin1Length(out));
    for (let i = 0; i < out.length; i++) buf[i] = out.charCodeAt(i) & 0xff;
    return buf;
  }

  blob(): Blob {
    // Copy into a plain ArrayBuffer so the Blob type is exact across TS libs.
    return new Blob([this.bytes() as unknown as BlobPart], { type: 'application/pdf' });
  }
}

/** Every character we emit is a single byte under Latin-1, so length in
 *  characters IS length in bytes — but say so explicitly, because the xref
 *  table is silently corrupt if that ever stops being true. */
function latin1Length(s: string): number {
  return s.length;
}
