import { clamp, easeInOutCubic, lerp, smoothstep } from './util';

/**
 * Maps the document scroll position to the journey's continuous parameters.
 * All anchors are measured from the DOM, so layout changes (fonts, viewport, content) are picked
 * up automatically.
 */
export interface Journey {
  /** chapters I–II: 0 = hero, 1 = at the horizon */
  blackhole: number;
  blackholeWeight: number;
  /** vacuum → first eigenstate, 0…1 */
  entry: number;
  /** continuous state index: 0 vacuum, 1…n roles */
  orbital: number;
  orbitalWeight: number;
  /** chapter IV zoom-out, 0…1 */
  zoom: number;
  galaxyWeight: number;
  /** which chapter the reader is in (0…3) */
  chapter: number;
}

interface Metrics {
  vh: number;
  aboutEnd: number;
  interTop: number;
  interH: number;
  roleTops: number[];
  roleCenters: number[];
  zoomTop: number;
  zoomH: number;
  sectionTops: number[];
}

const top = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

export class Director {
  private m: Metrics | null = null;
  readonly journey: Journey = {
    blackhole: 0,
    blackholeWeight: 1,
    entry: 0,
    orbital: 0,
    orbitalWeight: 0,
    zoom: 0,
    galaxyWeight: 0,
    chapter: 0,
  };
  /** discrete reduced-motion mode: snaps scrubbed values to their section's resting state */
  reduced = false;

  measure() {
    const q = <T extends Element>(s: string) => document.querySelector<T>(s);
    const aboutTrack = q('.about__track');
    const inter = q('.interstitial');
    const zoom = q('.zoom');
    const roles = [...document.querySelectorAll<HTMLElement>('.role')];
    const sections = ['#horizon', '#about', '#experience', '#contact'].map((s) => q(s));
    if (!aboutTrack || !inter || !zoom || sections.some((s) => !s)) return;
    const vh = window.innerHeight;
    this.m = {
      vh,
      aboutEnd: top(aboutTrack) + aboutTrack.getBoundingClientRect().height,
      interTop: top(inter),
      interH: inter.getBoundingClientRect().height,
      roleTops: roles.map(top),
      roleCenters: roles.map((r) => top(r) + r.getBoundingClientRect().height / 2),
      zoomTop: top(zoom),
      zoomH: zoom.getBoundingClientRect().height,
      sectionTops: sections.map((s) => top(s!)),
    };
  }

  update(scroll: number): Journey {
    const m = this.m;
    const j = this.journey;
    if (!m) return j;
    const { vh } = m;

    // I–II: from the top of the page until the about track releases its sticky panel
    const bh = clamp(scroll / Math.max(1, m.aboutEnd - vh));
    // vacuum condenses into the first eigenstate between the interstitial line and the first card
    const entryStart = m.interTop - vh * 0.15;
    const entryEnd = (m.roleCenters[0] ?? m.interTop + m.interH) - vh * 0.5;
    const entry = clamp((scroll - entryStart) / Math.max(1, entryEnd - entryStart));
    // each subsequent card triggers a downward transition while it enters the viewport
    let orbital = entry;
    for (let k = 1; k < m.roleTops.length; k++) {
      const start = m.roleTops[k]! - vh * 1.0;
      orbital += clamp((scroll - start) / (vh * 0.7));
    }
    const zoom = clamp((scroll - (m.zoomTop - vh * 0.4)) / Math.max(1, m.zoomH - vh * 0.6));

    if (this.reduced) {
      j.blackhole = bh < 0.98 ? 0 : 1;
      j.entry = entry > 0.5 ? 1 : 0;
      j.orbital = Math.round(orbital);
      j.zoom = zoom > 0.5 ? 1 : 0;
    } else {
      j.blackhole = bh;
      j.entry = entry;
      j.orbital = orbital;
      j.zoom = zoom;
    }
    j.blackholeWeight = 1 - smoothstep(0.955, 0.998, bh);
    j.orbitalWeight = smoothstep(0, 0.04, entry) * (1 - smoothstep(0.17, 0.26, zoom));
    j.galaxyWeight = smoothstep(0.1, 0.26, zoom);

    const probe = scroll + vh * 0.5;
    let chapter = 0;
    m.sectionTops.forEach((t, i) => {
      if (probe >= t) chapter = i;
    });
    j.chapter = chapter;
    return j;
  }

  /**
   * Field-of-view scale (log10 metres) blended across chapter boundaries. During the interstitial
   * the counter sweeps logarithmically from the horizon to the atom.
   */
  scaleLog(bh: number, atom: number, galaxy: number): number {
    const j = this.journey;
    if (j.zoom > 0) return galaxy;
    if (j.entry > 0) return lerp(bh, atom, easeInOutCubic(j.entry));
    return bh;
  }
}
