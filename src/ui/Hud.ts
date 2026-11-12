import type { Readout } from '../gl/Chapter';

const LY = 9.4607e15;
const AU = 1.495978707e11;

function sig(x: number, digits = 3): string {
  if (x >= 1000) return Math.round(x).toLocaleString('en-US').replace(/,/g, ' ');
  return Number(x.toPrecision(digits)).toString();
}

/** Human-readable length, e.g. 3.1e14 → "2 070 AU". */
export function humanLength(m: number): string {
  if (m >= 1e3 * LY) return `${sig(m / (1e3 * LY))} kly`;
  if (m >= 0.3 * LY) return `${sig(m / LY)} ly`;
  if (m >= 0.05 * AU) return `${sig(m / AU)} AU`;
  if (m >= 1e3) return `${sig(m / 1e3)} km`;
  if (m >= 1) return `${sig(m)} m`;
  if (m >= 1e-3) return `${sig(m * 1e3)} mm`;
  if (m >= 1e-6) return `${sig(m * 1e6)} µm`;
  if (m >= 1e-9) return `${sig(m * 1e9)} nm`;
  return `${sig(m * 1e12)} pm`;
}

const OBJECTS: [number, string][] = [
  [-11, 'hydrogen atom'],
  [-8.6, 'DNA double helix'],
  [-7, 'virus'],
  [-5, 'living cell'],
  [-3, 'grain of sand'],
  [-0.5, 'human'],
  [3, 'city'],
  [6.6, 'Earth'],
  [8.8, 'Sun'],
  [11, 'Earth’s orbit'],
  [12.8, 'Solar System'],
  [15.6, 'one light-year'],
  [16.6, 'nearest stars'],
  [18.2, 'star-forming region'],
  [19.6, 'spiral arm'],
  [20.6, 'Milky Way–like galaxy'],
];

export function objectAtScale(log10: number): string {
  let name = OBJECTS[0]![1];
  for (const [l, n] of OBJECTS) if (log10 >= l) name = n;
  return name;
}

const fmtExp = (log10: number) => {
  const v = log10.toFixed(1).replace('-', '−');
  return `10<sup>${v}</sup> m`;
};

export class Hud {
  private readonly numeral = document.querySelector<HTMLElement>('[data-hud-numeral]');
  private readonly title = document.querySelector<HTMLElement>('[data-hud-title]');
  private readonly scaleExp = document.querySelector<HTMLElement>('[data-scale-exp]');
  private readonly scaleHuman = document.querySelector<HTMLElement>('[data-scale-human]');
  private readonly readoutsEl = document.querySelector<HTMLElement>('[data-readouts]');
  private readonly rail = [...document.querySelectorAll<HTMLAnchorElement>('[data-rail]')];
  private readonly zoomScale = document.querySelector<HTMLElement>('[data-zoom-scale]');
  private readonly zoomObject = document.querySelector<HTMLElement>('[data-zoom-object]');
  private readonly electron = document.querySelector<SVGCircleElement>('[data-electron]');
  private readonly levels = [...document.querySelectorAll<SVGGElement>('.lv[data-level]')];
  private readonly transitions = [...document.querySelectorAll<SVGGElement>('[data-transition]')];
  private readonly levelYs: number[];

  private chapter = -1;
  private lastScale = '';
  private lastHuman = '';
  private lastReadouts = '';
  private lastReadoutTime = 0;
  private lastZoom = '';
  private lastActive = -2;

  constructor() {
    const svg = document.querySelector<SVGSVGElement>('.levels__svg');
    this.levelYs = (svg?.dataset.levelYs ?? '').split(',').filter(Boolean).map(Number);
  }

  setChapter(i: number) {
    if (i === this.chapter) return;
    this.chapter = i;
    // chapter names come from the rail markup (keeps site.ts — and any contact data — out of the bundle)
    const link = this.rail[i];
    if (!link) return;
    if (this.numeral) this.numeral.textContent = link.querySelector('.rail__num')?.textContent ?? '';
    if (this.title) this.title.textContent = link.querySelector('.rail__title')?.textContent ?? '';
    this.rail.forEach((a, k) => a.setAttribute('aria-current', k === i ? 'true' : 'false'));
  }

  setScale(log10: number) {
    if (!Number.isFinite(log10)) return;
    const exp = fmtExp(log10);
    if (exp !== this.lastScale && this.scaleExp) {
      this.scaleExp.innerHTML = exp;
      this.lastScale = exp;
    }
    const human = `≈ ${humanLength(Math.pow(10, log10))}`;
    if (human !== this.lastHuman && this.scaleHuman) {
      this.scaleHuman.textContent = human;
      this.lastHuman = human;
    }
  }

  setZoom(log10: number) {
    const key = log10.toFixed(1);
    if (key === this.lastZoom) return;
    this.lastZoom = key;
    if (this.zoomScale) this.zoomScale.innerHTML = fmtExp(log10);
    if (this.zoomObject) this.zoomObject.textContent = objectAtScale(log10);
  }

  setReadouts(list: Readout[], now: number) {
    if (!this.readoutsEl || now - this.lastReadoutTime < 90) return;
    this.lastReadoutTime = now;
    const html = list.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    if (html !== this.lastReadouts) {
      this.readoutsEl.innerHTML = html;
      this.lastReadouts = html;
    }
  }

  /** Energy diagram: electron position follows the continuous state index (1…n). */
  setOrbital(state: number) {
    if (!this.electron || this.levelYs.length === 0) return;
    const s = Math.min(Math.max(state - 1, 0), this.levelYs.length - 1);
    const i = Math.floor(s);
    const f = s - i;
    const y0 = this.levelYs[i]!;
    const y1 = this.levelYs[Math.min(i + 1, this.levelYs.length - 1)]!;
    const ease = f * f * (3 - 2 * f);
    this.electron.setAttribute('cy', (y0 + (y1 - y0) * ease).toFixed(2));
    this.electron.style.opacity = state < 0.6 ? String(Math.max(0, (state - 0.2) / 0.4)) : '1';
    const active = Math.round(s);
    const transitioning = f > 0.04 && f < 0.96 ? i : -1;
    const key = active * 10 + transitioning;
    if (key === this.lastActive) return;
    this.lastActive = key;
    this.levels.forEach((g, k) => g.classList.toggle('is-active', k === active));
    this.transitions.forEach((g, k) => g.classList.toggle('is-active', k === transitioning || (transitioning < 0 && k === active - 1)));
  }
}
