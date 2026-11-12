/**
 * Loading screen: a Gaussian wave packet whose width collapses as real loading work completes.
 */
export class Loader {
  private readonly el: HTMLElement | null;
  private readonly pct: HTMLElement | null;
  private readonly psi: SVGPathElement | null;
  private readonly env: SVGPathElement | null;
  private target = 0;
  private shown = 0;
  private raf = 0;
  private t0 = performance.now();
  private finished = false;

  constructor(root: Document = document) {
    this.el = root.getElementById('loader');
    this.pct = root.querySelector('[data-loader-pct]');
    this.psi = root.querySelector('.loader__psi');
    this.env = root.querySelector('.loader__envelope');
    if (this.el) this.tick();
  }

  set(progress: number) {
    this.target = Math.max(this.target, Math.min(1, progress));
  }

  private tick = () => {
    const now = performance.now();
    this.shown += (this.target - this.shown) * 0.08;
    if (Math.abs(this.target - this.shown) < 0.002) this.shown = this.target;
    this.draw((now - this.t0) / 1000);
    if (this.pct) this.pct.textContent = `${Math.round(this.shown * 100)}%`;
    if (!this.finished || this.shown < 0.999) this.raf = requestAnimationFrame(this.tick);
  };

  private draw(t: number) {
    if (!this.psi || !this.env) return;
    const p = this.shown;
    const e = 1 - Math.pow(1 - p, 2.2);
    const sigma = 0.5 * (1 - e) + 0.028;
    const k = 26;
    const W = 480;
    const H = 140;
    const cy = H / 2;
    const amp = 48 * (0.55 + 0.45 * e);
    let d = '';
    let up = '';
    let down = '';
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const x = -1 + (2 * i) / N;
      const g = Math.exp(-(x * x) / (2 * sigma * sigma)) * Math.min(1, 0.32 / Math.sqrt(sigma));
      const y = g * Math.cos(k * x - t * 5);
      const px = ((x + 1) / 2) * (W - 20) + 10;
      d += `${i ? 'L' : 'M'}${px.toFixed(1)} ${(cy - y * amp).toFixed(1)}`;
      up += `${i ? 'L' : 'M'}${px.toFixed(1)} ${(cy - g * amp).toFixed(1)}`;
      down += `${i ? 'L' : 'M'}${px.toFixed(1)} ${(cy + g * amp).toFixed(1)}`;
    }
    this.psi.setAttribute('d', d);
    this.env.setAttribute('d', `${up} ${down}`);
  }

  /** Resolve once the collapse animation has visually completed and the overlay has faded. */
  done(): Promise<void> {
    this.set(1);
    this.finished = true;
    return new Promise((resolve) => {
      const wait = () => {
        if (this.shown >= 0.999) {
          setTimeout(() => {
            this.el?.classList.add('is-done');
            setTimeout(() => {
              cancelAnimationFrame(this.raf);
              resolve();
            }, 700);
          }, 260);
        } else requestAnimationFrame(wait);
      };
      wait();
    });
  }

  /** Remove immediately (fallback paths). */
  dismiss() {
    this.finished = true;
    cancelAnimationFrame(this.raf);
    this.el?.classList.add('is-done');
  }
}
