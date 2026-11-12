import type { BlackHole, ObservatoryParams } from '../gl/chapters/blackhole/BlackHole';
import type { Motion } from './Motion';
import { clientLocale, num } from '../i18n/index.ts';

/**
 * Free-flight mode around the black hole: drag to orbit, wheel/pinch for distance, and physics
 * toggles that morph the image continuously (e.g. switching lensing off straightens the rays).
 */
export class Observatory {
  private readonly root = document.getElementById('observatory');
  private readonly form = this.root?.querySelector('form') ?? null;
  private readonly triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-observe]')];
  private readonly fab = document.querySelector<HTMLButtonElement>('.observe-fab');
  private lastTrigger: HTMLElement | null = null;
  private open = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private readonly loc = clientLocale();

  constructor(
    private readonly bh: BlackHole,
    private readonly motion: Motion,
    private readonly canvas: HTMLCanvasElement,
  ) {
    if (!this.root || !this.form) return;
    this.triggers.forEach((b) => {
      b.hidden = false;
      b.addEventListener('click', () => {
        this.lastTrigger = b;
        this.show();
      });
    });
    this.root.querySelector('[data-observe-close]')?.addEventListener('click', () => this.hide());
    this.form.addEventListener('submit', (e) => e.preventDefault());
    this.form.addEventListener('input', () => this.read());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.hide();
    });
    this.bindPointer();
    this.write();
  }

  /** Keep the floating button in sync with whether we are near the hole. */
  update() {
    if (!this.fab) return;
    this.fab.classList.toggle('is-away', !this.bh.inHero || this.open);
    if (this.open) this.write(false);
  }

  private show() {
    if (this.open || !this.root) return;
    this.open = true;
    if (this.motion.lenis) this.motion.lenis.scrollTo(0, { duration: 0.9, force: true, onComplete: () => this.open && this.motion.stop() });
    else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      this.motion.stop();
    }
    this.bh.setObserving(true);
    this.write();
    this.root.hidden = false;
    document.documentElement.classList.add('observing');
    this.root.querySelector<HTMLElement>('[data-observe-close]')?.focus({ preventScroll: true });
  }

  private hide() {
    if (!this.open || !this.root) return;
    this.open = false;
    this.bh.setObserving(false);
    document.documentElement.classList.remove('observing', 'dragging');
    this.root.hidden = true;
    this.motion.start();
    this.lastTrigger?.focus({ preventScroll: true });
  }

  private field<T extends HTMLInputElement>(name: string) {
    return this.form?.elements.namedItem(name) as T | null;
  }

  /** form → physics */
  private read() {
    const o = this.bh.observatory;
    o.lensing = this.field('lensing')?.checked ?? true;
    o.doppler = this.field('doppler')?.checked ?? true;
    o.redshift = this.field('redshift')?.checked ?? true;
    o.temperature = Number(this.field('temperature')?.value ?? o.temperature);
    o.inclination = Number(this.field('inclination')?.value ?? o.inclination);
    o.distance = Number(this.field('distance')?.value ?? o.distance);
    this.write(false);
  }

  /** physics → form (camera can change by dragging) */
  private write(all = true) {
    const o: ObservatoryParams = this.bh.observatory;
    const set = (name: string, value: number, text: string) => {
      const input = this.field(name);
      if (input && document.activeElement !== input) input.value = String(value);
      if (input) {
        const min = Number(input.min);
        const max = Number(input.max);
        input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
      }
      const out = this.form?.querySelector(`[data-out="${name}"]`);
      if (out) out.textContent = text;
    };
    set('temperature', o.temperature, `${num(Math.round(o.temperature), 0, this.loc)} K`);
    set('inclination', Math.round(o.inclination), `${Math.round(o.inclination)}°`);
    set('distance', Math.round(o.distance * 2) / 2, `${num(o.distance, 1, this.loc)} r_s`);
    if (all) {
      const box = (name: string, v: boolean) => {
        const el = this.field(name);
        if (el) el.checked = v;
      };
      box('lensing', o.lensing);
      box('doppler', o.doppler);
      box('redshift', o.redshift);
    }
  }

  private bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      c.setPointerCapture(e.pointerId);
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 1) this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      document.documentElement.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.open) return;
      const prev = this.touches.get(e.pointerId);
      if (prev) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.pinch > 0) this.bh.zoom(this.pinch / d);
        this.pinch = d;
        return;
      }
      if (this.drag && this.drag.id === e.pointerId) {
        this.bh.orbit(e.clientX - this.drag.x, e.clientY - this.drag.y);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = 0;
      if (this.drag?.id === e.pointerId) this.drag = null;
      if (this.touches.size === 0) document.documentElement.classList.remove('dragging');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.open) return;
        e.preventDefault();
        this.bh.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.open || (e.target as HTMLElement)?.closest?.('input')) return;
      const step = e.shiftKey ? 30 : 10;
      if (e.key === 'ArrowLeft') this.bh.orbit(-step, 0);
      else if (e.key === 'ArrowRight') this.bh.orbit(step, 0);
      else if (e.key === 'ArrowUp') this.bh.orbit(0, -step);
      else if (e.key === 'ArrowDown') this.bh.orbit(0, step);
      else if (e.key === '+' || e.key === '=') this.bh.zoom(0.92);
      else if (e.key === '-') this.bh.zoom(1.08);
    });
  }
}
