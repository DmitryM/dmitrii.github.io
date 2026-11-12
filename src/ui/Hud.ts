import type { Readout } from '../gl/Chapter';

import { UI, clientLocale, num, sig, type Locale } from '../i18n/index.ts';

const LY = 9.4607e15;
const AU = 1.495978707e11;

/** Human-readable length, e.g. 3.1e14 → "2 070 AU" (locale-aware units and decimals). */
export function humanLength(m: number, loc: Locale = 'en'): string {
  const u = UI[loc].units;
  if (m >= 1e3 * LY) return `${sig(m / (1e3 * LY), loc)} ${u.kly}`;
  if (m >= 0.3 * LY) return `${sig(m / LY, loc)} ${u.ly}`;
  if (m >= 0.05 * AU) return `${sig(m / AU, loc)} ${u.au}`;
  if (m >= 1e3) return `${sig(m / 1e3, loc)} ${u.km}`;
  if (m >= 1) return `${sig(m, loc)} ${u.m}`;
  if (m >= 1e-3) return `${sig(m * 1e3, loc)} ${u.mm}`;
  if (m >= 1e-6) return `${sig(m * 1e6, loc)} ${u.um}`;
  if (m >= 1e-9) return `${sig(m * 1e9, loc)} ${u.nm}`;
  return `${sig(m * 1e12, loc)} ${u.pm}`;
}

/** log10(size in m) at which each entry of UI.objects becomes the reference object. */
const OBJECT_SCALES = [-11, -8.6, -7, -5, -3, -0.5, 3, 6.6, 8.8, 11, 12.8, 15.6, 16.6, 18.2, 19.6, 20.6];

export function objectAtScale(log10: number, loc: Locale = 'en'): string {
  const names = UI[loc].objects;
  let k = 0;
  OBJECT_SCALES.forEach((l, i) => {
    if (log10 >= l) k = i;
  });
  return names[k] ?? names[0]!;
}

const fmtExp = (log10: number, loc: Locale) => `10<sup>${num(log10, 1, loc)}</sup> ${UI[loc].units.m}`;

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
  private readonly loc = clientLocale();
  private readonly langLink = document.querySelector<HTMLAnchorElement>('[data-lang-switch]');

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
    // switching language keeps the reader in the same chapter
    if (this.langLink) {
      const base = this.langLink.getAttribute('href')!.split('#')[0];
      this.langLink.setAttribute('href', i > 0 ? `${base}${link.getAttribute('href')}` : base!);
    }
    this.rail.forEach((a, k) => a.setAttribute('aria-current', k === i ? 'true' : 'false'));
  }

  setScale(log10: number) {
    if (!Number.isFinite(log10)) return;
    const exp = fmtExp(log10, this.loc);
    if (exp !== this.lastScale && this.scaleExp) {
      this.scaleExp.innerHTML = exp;
      this.lastScale = exp;
    }
    const human = `≈ ${humanLength(Math.pow(10, log10), this.loc)}`;
    if (human !== this.lastHuman && this.scaleHuman) {
      this.scaleHuman.textContent = human;
      this.lastHuman = human;
    }
  }

  setZoom(log10: number) {
    const key = log10.toFixed(1);
    if (key === this.lastZoom) return;
    this.lastZoom = key;
    if (this.zoomScale) this.zoomScale.innerHTML = fmtExp(log10, this.loc);
    if (this.zoomObject) this.zoomObject.textContent = objectAtScale(log10, this.loc);
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
