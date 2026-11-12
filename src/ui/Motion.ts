import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

type FrameFn = (dt: number) => void;

/**
 * One animation clock for everything: GSAP's ticker drives Lenis (smooth scroll), ScrollTrigger
 * and the WebGL frame, so scroll position and rendering never drift apart.
 */
export class Motion {
  readonly lenis: Lenis | null;
  private readonly frames: FrameFn[] = [];

  constructor(private readonly reduced: boolean) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    this.lenis = reduced
      ? null
      : new Lenis({
          autoRaf: false,
          lerp: 0.085,
          wheelMultiplier: 0.9,
          touchMultiplier: 1.3,
          anchors: true,
          allowNestedScroll: true,
        });
    this.lenis?.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time, deltaMs) => {
      this.lenis?.raf(time * 1000);
      const dt = deltaMs / 1000;
      for (const f of this.frames) f(dt);
    });
    gsap.ticker.lagSmoothing(0);
  }

  scroll(): number {
    return this.lenis ? this.lenis.scroll : window.scrollY;
  }

  onFrame(fn: FrameFn) {
    this.frames.push(fn);
  }

  stop() {
    this.lenis?.stop();
    document.documentElement.style.overflow = 'hidden';
  }

  start() {
    document.documentElement.style.overflow = '';
    this.lenis?.start();
  }

  /** Initial hidden states and scroll-linked reveals. Safe to call before the loader finishes. */
  setupReveals() {
    if (this.reduced) return;
    document.documentElement.classList.add('reveal-ready');

    // fade-up blocks
    ScrollTrigger.batch('[data-reveal]:not(.hero [data-reveal])', {
      start: 'top 88%',
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
    });

    // masked line reveals for display copy
    document.querySelectorAll<HTMLElement>('[data-split-lines]').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        linesClass: 'line',
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: 1.25,
            ease: 'expo.out',
            stagger: 0.09,
            scrollTrigger: { trigger: el, start: 'top 84%', once: true },
          }),
      });
    });

    // hero copy drifts away as the fall begins
    gsap.to('.hero__content', {
      opacity: 0,
      y: -60,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: '55% top', scrub: true },
    });
    // the bio fades into the dark just before the horizon
    gsap.to('.about__content', {
      opacity: 0,
      y: -40,
      ease: 'none',
      scrollTrigger: { trigger: '.about__track', start: '72% bottom', end: 'bottom bottom', scrub: true },
    });
    gsap.fromTo(
      '.about__content',
      { opacity: 0 },
      { opacity: 1, ease: 'none', scrollTrigger: { trigger: '.about__track', start: 'top 70%', end: 'top 10%', scrub: true } },
    );
    // interstitial line and zoom counter fade with their scroll windows
    for (const sel of ['.interstitial .counter', '.zoom__sticky']) {
      const trigger = sel === '.zoom__sticky' ? '.zoom' : '.interstitial';
      gsap
        .timeline({ scrollTrigger: { trigger, start: 'top 80%', end: 'bottom 20%', scrub: true } })
        .fromTo(sel, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' })
        .to(sel, { opacity: 1, duration: 0.5 })
        .to(sel, { opacity: 0, duration: 0.25, ease: 'none' });
    }
    // role cards ease in from depth
    gsap.utils.toArray<HTMLElement>('.role__card').forEach((card) => {
      gsap.fromTo(
        card,
        { opacity: 0, y: 60, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, ease: 'expo.out', duration: 1.3, scrollTrigger: { trigger: card, start: 'top 85%', once: true } },
      );
    });

    // hero intro: split and tuck the name into its masks *now*, while the loader still covers the
    // page, so it is never visible before its entrance animation
    gsap.set('.hero [data-reveal]', { opacity: 0, y: 18 });
    this.heroChars = [...document.querySelectorAll<HTMLElement>('.hero [data-split]')].map(
      (el) => SplitText.create(el, { type: 'chars', charsClass: 'char', mask: 'chars' }).chars as HTMLElement[],
    );
    gsap.set(this.heroChars.flat(), { yPercent: 115 });
  }

  private heroChars: HTMLElement[][] = [];

  /** Plays once the loader has faded. */
  intro() {
    if (this.reduced) {
      gsap.set('.hero [data-reveal]', { opacity: 1, y: 0 });
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    this.heroChars.forEach((chars, i) => {
      tl.to(chars, { yPercent: 0, duration: 1.6, stagger: 0.045 }, 0.1 + i * 0.18);
    });
    tl.to('.hero [data-reveal]', { opacity: 1, y: 0, duration: 1.2, stagger: 0.12 }, 0.55);
    ScrollTrigger.refresh();
  }

  refresh() {
    ScrollTrigger.refresh();
  }
}
