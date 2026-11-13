import type { BlackHole } from '../gl/chapters/blackhole/BlackHole';
import type { Caption, Junk, JunkEvent } from '../gl/chapters/blackhole/junk/Junk';
import type { Observatory } from './Observatory';
import { JUNK_IDS, UI, clientLocale, num, type JunkId } from '../i18n/index.ts';

interface Sample {
  x: number;
  y: number;
  t: number;
}

/**
 * "Throw something in": the gestures, drifting objects, captions and log around the Junk chapter.
 *  - every so often something drifts through the view; click (or tap) it, or its caption, and it
 *    goes in keeping its momentum — or grab it with the mouse and fling it;
 *  - mouse / pen in the hero: press on empty sky to pick the next object up, release to fling it
 *    (a plain click drops it in);
 *  - touch: a tap throws from that point (a scroll gesture is left alone);
 *  - observatory: a tap on the sky throws, a drag still orbits; its panel has a throw button.
 */
export class Feeder {
  private readonly loc = clientLocale();
  private readonly t = UI[this.loc].junk;
  private readonly root = document.documentElement;
  private readonly layer = document.querySelector<HTMLElement>('[data-junk-captions]');
  private readonly log = document.querySelector<HTMLElement>('[data-junk-log]');
  private readonly captionEls = new Map<number, { el: HTMLElement; drifting: boolean; width: number }>();
  /** when the next object may drift by (performance.now() ms) */
  private nextDrift = performance.now() + 2500;
  private readonly list: Caption[] = [];
  private deck: JunkId[] = [];
  private last: JunkId | null = null;
  private count = 0;
  private logTimer = 0;
  private holding: { uid: number; pointer: number; samples: Sample[] } | null = null;
  private tap: { pointer: number; x: number; y: number; t: number } | null = null;
  private readonly coarse = window.matchMedia('(pointer: coarse)');

  constructor(
    private readonly junk: Junk,
    private readonly bh: BlackHole,
    observatory: Observatory | null,
  ) {
    document.querySelectorAll<HTMLButtonElement>('[data-throw]').forEach((b) => {
      b.hidden = false;
      b.addEventListener('click', () => this.throwFromEdge());
    });
    document.querySelectorAll<HTMLElement>('[data-throw-hint]').forEach((h) => (h.hidden = false));
    if (observatory) observatory.onTap = (x, y) => this.throwAtPoint(x, y);
    this.bindPointer();
    this.root.classList.add('junk-ready');
  }

  /** The next object: a shuffled deck, so nothing repeats until everything has been thrown. */
  private next(): JunkId {
    if (this.deck.length === 0) {
      const d = [...JUNK_IDS];
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j]!, d[i]!];
      }
      if (d[d.length - 1] === this.last) [d[0], d[d.length - 1]] = [d[d.length - 1]!, d[0]!];
      this.deck = d;
    }
    this.last = this.deck.pop()!;
    return this.last;
  }

  private canThrowHere(e: PointerEvent): boolean {
    if (this.root.classList.contains('observing') || !this.bh.inHero) return false;
    const target = e.target as Element | null;
    if (!target?.closest?.('.hero')) return false;
    return !target.closest('a, button, input, select, textarea, label, .hero__content');
  }

  private bindPointer() {
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.canThrowHere(e)) return;
      if (e.pointerType === 'touch') {
        this.tap = { pointer: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
        return;
      }
      // mouse / pen: grab the drifting object under the pointer, or pick up a new one
      // (and keep the pointer even if it leaves the window)
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const hit = this.junk.pick(e.clientX, e.clientY);
      let uid: number;
      if (hit !== null) {
        this.junk.grab(hit, e.clientX, e.clientY);
        uid = hit;
      } else uid = this.junk.hold(this.next(), e.clientX, e.clientY);
      this.holding = { uid, pointer: e.pointerId, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
      this.root.classList.remove('junk-hover');
      this.root.classList.add('junk-holding');
    });
    window.addEventListener(
      'pointermove',
      (e) => {
        const h = this.holding;
        if (!h && e.pointerType === 'mouse') {
          // a pointer cursor over something drifting by
          const over = (this.root.classList.contains('observing') || this.canThrowHere(e)) && this.junk.pick(e.clientX, e.clientY) !== null;
          this.root.classList.toggle('junk-hover', over);
        }
        if (!h || e.pointerId !== h.pointer) return;
        this.junk.moveHeld(h.uid, e.clientX, e.clientY);
        h.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (h.samples.length > 12) h.samples.shift();
      },
      { passive: true },
    );
    window.addEventListener('pointerup', (e) => {
      const tap = this.tap;
      if (tap && tap.pointer === e.pointerId) {
        this.tap = null;
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && performance.now() - tap.t < 500) this.throwAtPoint(e.clientX, e.clientY);
      }
      const h = this.holding;
      if (h && h.pointer === e.pointerId) {
        const { vx, vy } = this.flingVelocity(h.samples);
        this.junk.release(h.uid, vx, vy);
        this.holding = null;
        this.root.classList.remove('junk-holding');
      }
    });
    const drop = (pointer?: number) => {
      const h = this.holding;
      if (h && (pointer === undefined || h.pointer === pointer)) {
        this.junk.release(h.uid);
        this.holding = null;
        this.root.classList.remove('junk-holding');
      }
    };
    window.addEventListener('pointercancel', (e) => {
      if (this.tap?.pointer === e.pointerId) this.tap = null;
      drop(e.pointerId);
    });
    window.addEventListener('blur', () => drop());
  }

  /** Pointer velocity over the last ~100 ms (CSS px per second); zero if it had come to rest. */
  private flingVelocity(samples: Sample[]) {
    const now = performance.now();
    const last = samples[samples.length - 1]!;
    if (now - last.t > 90) return { vx: 0, vy: 0 };
    const first = samples.find((s) => last.t - s.t <= 100) ?? last;
    const dt = (last.t - first.t) / 1000;
    if (dt < 0.012) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  /** A tap or click: the drifting object there goes in, otherwise a new one is thrown from there. */
  private throwAtPoint(x: number, y: number) {
    const hit = this.junk.pick(x, y);
    if (hit !== null) this.junk.throwDrifter(hit);
    else this.junk.throwAt(this.next(), x, y);
  }

  /** Tosses the next object in from near the edge of the view, swinging around the hole. */
  private throwFromEdge() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hole = this.junk.holeOnScreen();
    const a = Math.random() * Math.PI * 2;
    const R = Math.min(W, H) * (0.34 + Math.random() * 0.1);
    const x = Math.min(W - 40, Math.max(40, hole.x + Math.cos(a) * R * 1.25));
    const y = Math.min(H - 90, Math.max(90, hole.y + Math.sin(a) * R));
    const dx = hole.x - x;
    const dy = hole.y - y;
    const d = Math.hypot(dx, dy) || 1;
    // mostly sideways, a little inward
    this.junk.throwAt(this.next(), x, y, (-dy / d) * 260 + (dx / d) * 160, (dx / d) * 260 + (dy / d) * 160);
  }

  /** Once per frame, after the scene has been drawn. */
  update() {
    let e: JunkEvent | undefined;
    while ((e = this.junk.events.shift())) this.onEvent(e);
    this.scheduleDrifters();
    this.placeCaptions();
  }

  /**
   * Now and then something drifts by, one or two at a time, while the hole is in view. Not with
   * reduced motion: nothing moves that the visitor didn't set moving.
   */
  private scheduleDrifters() {
    if (this.junk.reduced) return;
    const now = performance.now();
    const visible = (this.bh.inHero || this.root.classList.contains('observing')) && document.visibilityState === 'visible';
    if (!visible) {
      this.nextDrift = Math.max(this.nextDrift, now + 2000);
      return;
    }
    if (now < this.nextDrift || this.junk.drifting >= 2) return;
    const spawned = this.junk.spawnDrifter(this.next()) !== null;
    this.nextDrift = now + (spawned ? 7000 + Math.random() * 8000 : 1500);
  }

  private onEvent(e: JunkEvent) {
    if (e.type === 'shred') {
      if (this.coarse.matches) navigator.vibrate?.(12);
      return;
    }
    this.count++;
    const [name, , epitaph] = this.t.items[e.id];
    const line = this.t.log.replace('{name}', name).replace('{r}', num(e.r, 1, this.loc)).replace('{epitaph}', epitaph);
    const log = this.log;
    if (!log) return;
    log.replaceChildren();
    const count = document.createElement('span');
    count.className = 'junk-log__count';
    count.textContent = `×${this.count} ${this.t.count}`;
    const text = document.createElement('span');
    text.className = 'junk-log__line';
    text.textContent = line;
    log.append(count, text);
    log.hidden = false;
    // restart the entrance transition
    log.classList.remove('is-on');
    void log.offsetWidth;
    log.classList.add('is-on');
    window.clearTimeout(this.logTimer);
    this.logTimer = window.setTimeout(() => log.classList.remove('is-on'), 6500);
  }

  private placeCaptions() {
    const list = this.junk.captions(this.list);
    if (!this.layer || (list.length === 0 && this.captionEls.size === 0)) return;
    const seen = new Set<number>();
    for (const c of list) {
      seen.add(c.uid);
      let entry = this.captionEls.get(c.uid);
      // a drifting object's caption is a button (keyboard users can throw it too); once it is on
      // its way in, a plain label
      if (entry && entry.drifting !== c.drifting) {
        entry.el.remove();
        entry = undefined;
      }
      if (!entry) {
        const caption = this.t.items[c.id][1];
        let el: HTMLElement;
        if (c.drifting) {
          const uid = c.uid;
          el = document.createElement('button');
          el.setAttribute('type', 'button');
          el.className = 'junk-caption junk-caption--drifter';
          el.setAttribute('aria-label', this.t.throwIt.replace('{name}', this.t.items[c.id][0]));
          el.textContent = caption;
          el.addEventListener('click', () => this.junk.throwDrifter(uid));
        } else {
          el = document.createElement('span');
          el.className = 'junk-caption';
          el.setAttribute('aria-hidden', 'true');
          el.textContent = caption;
        }
        this.layer.append(el);
        entry = { el, drifting: c.drifting, width: 0 };
        this.captionEls.set(c.uid, entry);
      }
      // centred under the object, but kept inside the view
      const half = (entry.width ||= entry.el.offsetWidth) / 2;
      const x = Math.min(Math.max(c.x, half + 8), window.innerWidth - half - 8);
      entry.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(c.y + c.radius * 0.95 + 10).toFixed(1)}px, 0) translateX(-50%)`;
      entry.el.style.opacity = c.alpha.toFixed(3);
    }
    for (const [uid, entry] of this.captionEls) {
      if (!seen.has(uid)) {
        entry.el.remove();
        this.captionEls.delete(uid);
      }
    }
  }
}
