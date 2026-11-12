/**
 * Pure HTML-string renderers. Used at build time by the siteContent() Vite plugin and by tests.
 * Everything visible on the page is produced here from src/content/site.ts (+ UI strings).
 */
import { site, rolesFor, type ContactLinks, type Role } from './site.ts';
import { formatWavelength, band, bandLabel, levelEnergy, lineName, transitionWavelength } from '../physics/spectra.ts';
import { orbitalSubscript } from '../physics/hydrogen.ts';
import { LOCALES, LOCALE_PATH, UI, num, type Locale } from '../i18n/index.ts';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const reverse = (s: string) => [...s].reverse().join('');
const pageUrl = (loc: Locale) => new URL(LOCALE_PATH[loc], site.url).href;

/* ───────────────────────────── links ───────────────────────────── */

export interface RenderedLink {
  id: keyof ContactLinks;
  label: string;
  href: string;
  handle: string;
  external: boolean;
  email?: { u: string; d: string };
}

export function contactLinks(links: ContactLinks = site.links, loc: Locale = 'en'): RenderedLink[] {
  const out: RenderedLink[] = [];
  if (links.linkedin.trim()) {
    const slug = links.linkedin.replace(/\/+$/, '').split('/').pop() ?? '';
    out.push({
      id: 'linkedin',
      label: 'LinkedIn',
      href: links.linkedin.trim(),
      handle: `in/${slug.replace(/-[0-9a-f]{6,}$/i, '')}`,
      external: true,
    });
  }
  if (links.email.trim() && links.email.includes('@')) {
    const [u, d] = links.email.trim().split('@') as [string, string];
    out.push({
      id: 'email',
      label: UI[loc].emailLabel,
      href: '#contact',
      handle: `${u} [at] ${d.replace(/\./g, ' [dot] ')}`,
      external: false,
      email: { u: reverse(u), d: reverse(d) },
    });
  }
  if (links.github.trim()) {
    const user = links.github.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '');
    out.push({ id: 'github', label: 'GitHub', href: `https://github.com/${user}`, handle: `@${user}`, external: true });
  }
  if (links.telegram.trim()) {
    const user = links.telegram.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    out.push({ id: 'telegram', label: 'Telegram', href: `https://t.me/${user}`, handle: `@${user}`, external: true });
  }
  return out;
}

function renderLink(l: RenderedLink, cls = 'link'): string {
  const attrs = l.email
    ? `data-email data-u="${esc(l.email.u)}" data-d="${esc(l.email.d)}"`
    : l.external
      ? 'target="_blank" rel="me noopener noreferrer"'
      : '';
  return `<a class="${cls}" href="${esc(l.href)}" ${attrs}><span class="${cls}__label">${esc(l.label)}</span><span class="${cls}__handle">${esc(
    l.handle,
  )}</span><span class="${cls}__arrow" aria-hidden="true">${l.email ? '→' : '↗'}</span></a>`;
}

/* ───────────────────────────── head ───────────────────────────── */

export function jsonLd(loc: Locale = 'en'): object {
  const t = site.text[loc];
  const links = contactLinks(site.links, loc).filter((l) => l.external);
  const knows = rolesFor('en')
    .flatMap((r) => r.groups.map((g) => g.title))
    .filter((x) => x !== 'Personal Projects' && x !== 'Web');
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: t.person.name,
    alternateName: t.person.alternateName,
    givenName: t.person.givenName,
    familyName: t.person.familyName,
    jobTitle: t.person.jobTitle,
    url: pageUrl(loc),
    image: new URL('og.jpg', site.url).href,
    address: { '@type': 'PostalAddress', addressLocality: t.person.location, addressCountry: site.person.countryCode },
    sameAs: links.map((l) => l.href),
    knowsAbout: [...knows, 'Web Full Stack Development'],
    knowsLanguage: ['en', 'ru'],
  };
}

export function renderHead(loc: Locale = 'en'): string {
  const t = site.text[loc];
  const { seo, person } = t;
  const url = pageUrl(loc);
  const og = new URL(loc === 'en' ? 'og.jpg' : `og-${loc}.jpg`, site.url).href;
  const alternates = [
    ...LOCALES.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(pageUrl(l))}" />`),
    `<link rel="alternate" hreflang="x-default" href="${esc(pageUrl('en'))}" />`,
  ];
  return [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}" />`,
    `<meta name="keywords" content="${esc(seo.keywords)}" />`,
    `<meta name="author" content="${esc(person.name)}" />`,
    `<meta name="theme-color" content="#05060a" />`,
    `<meta name="color-scheme" content="dark" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    ...alternates,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="${esc(person.name)}" />`,
    `<meta property="og:locale" content="${t.ogLocale}" />`,
    ...LOCALES.filter((l) => l !== loc).map((l) => `<meta property="og:locale:alternate" content="${site.text[l].ogLocale}" />`),
    `<meta property="og:title" content="${esc(seo.title)}" />`,
    `<meta property="og:description" content="${esc(seo.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(og)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(UI[loc].ogAlt)}" />`,
    `<meta property="profile:first_name" content="${esc(person.givenName)}" />`,
    `<meta property="profile:last_name" content="${esc(person.familyName)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(seo.title)}" />`,
    `<meta name="twitter:description" content="${esc(seo.description)}" />`,
    `<meta name="twitter:image" content="${esc(og)}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd(loc)).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
}

/* ───────────────────────────── energy diagram ───────────────────────────── */

export function renderLevels(roles: Role[], loc: Locale = 'en'): string {
  const ui = UI[loc];
  const W = 260;
  const top = 40;
  const bottom = 430;
  const eMin = -3.75;
  const y = (E: number) => top + (E / eMin) * (bottom - top);
  const ns = roles.map((r) => r.state.n);
  const ev = (E: number) => `${num(E, 2, loc)} ${ui.eV}`;
  const lines: string[] = [];

  // ionisation limit
  lines.push(
    `<g class="lv lv--inf"><line x1="64" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" /><text x="56" y="${y(0) + 4}" class="lv__n" text-anchor="end">∞</text><text x="${W - 8}" y="${y(0) - 8}" class="lv__e" text-anchor="end">0 ${ui.eV} · ${esc(ui.levels.ionised)}</text></g>`,
  );
  roles.forEach((r, i) => {
    const E = levelEnergy(r.state.n);
    const yy = y(E);
    lines.push(
      `<g class="lv" data-level="${i}"><line x1="64" x2="${W - 8}" y1="${yy}" y2="${yy}" /><text x="56" y="${yy + 4}" class="lv__n" text-anchor="end">n=${r.state.n}</text><text x="${W - 8}" y="${yy - 8}" class="lv__e" text-anchor="end">${ev(
        E,
      )}</text><text x="70" y="${yy + 16}" class="lv__role">${esc(r.title)}</text></g>`,
    );
  });
  // transitions
  for (let i = 0; i + 1 < roles.length; i++) {
    const a = roles[i]!.state.n;
    const b = roles[i + 1]!.state.n;
    const lam = transitionWavelength(a, b);
    const x = 170;
    const y1 = y(levelEnergy(a)) + 4;
    const y2 = y(levelEnergy(b)) - 6;
    lines.push(
      `<g class="tr tr--${band(lam)}" data-transition="${i}"><path d="M${x} ${y1} L${x} ${y2}" /><path class="tr__head" d="M${x - 4} ${y2 - 7} L${x} ${y2} L${x + 4} ${y2 - 7}" /><text x="${x - 8}" y="${(y1 + y2) / 2 + 4}" text-anchor="end" class="tr__label">${esc(
        lineName(a, b, loc),
      )}</text><text x="${x - 8}" y="${(y1 + y2) / 2 + 18}" text-anchor="end" class="tr__lambda">${formatWavelength(lam, loc)}</text></g>`,
    );
  }
  // ground state (broken axis)
  if (!ns.includes(1)) {
    const yb = bottom + 30;
    lines.push(
      `<g class="lv lv--ground"><path class="lv__break" d="M100 ${bottom + 6} l8 -6 l8 12 l8 -12 l8 6" /><line x1="64" x2="${W - 8}" y1="${yb}" y2="${yb}" /><text x="56" y="${yb + 4}" class="lv__n" text-anchor="end">n=1</text><text x="${W - 8}" y="${yb - 8}" class="lv__e" text-anchor="end">${ev(
        levelEnergy(1),
      )}</text></g>`,
    );
  }
  const first = roles[0] ? y(levelEnergy(roles[0].state.n)) : top;
  lines.push(`<circle class="electron" data-electron cx="96" cy="${first}" r="5" />`);
  const levelYs = roles.map((r) => y(levelEnergy(r.state.n)).toFixed(2)).join(',');
  return `<svg class="levels__svg" viewBox="0 0 ${W} ${bottom + 48}" role="img" aria-labelledby="levels-title" data-level-ys="${levelYs}"><title id="levels-title">${esc(
    ui.levels.title,
  )}</title>${lines.join('')}</svg>`;
}

/* ───────────────────────────── body ───────────────────────────── */

function renderRole(r: Role, i: number, roles: Role[], loc: Locale): string {
  const ui = UI[loc];
  const E = levelEnergy(r.state.n);
  const sub = orbitalSubscript(r.state.l, r.state.m);
  const next = roles[i + 1];
  let transition = '';
  if (next) {
    const lam = transitionWavelength(r.state.n, next.state.n);
    transition = `<p class="role__transition tr--${band(lam)}"><span aria-hidden="true">↓</span> n=${r.state.n} → ${next.state.n} · ${esc(
      lineName(r.state.n, next.state.n, loc),
    )} · ${formatWavelength(lam, loc)} · ${esc(bandLabel(band(lam), loc))}</p>`;
  }
  const groups = r.groups
    .map(
      (g) =>
        `<section class="group"><h4 class="group__title">${esc(g.title)}</h4><ul class="group__list">${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></section>`,
    )
    .join('');
  const end = r.end ? `<time datetime="${r.end}">${esc(r.endLabel)}</time>` : `<span>${esc(r.endLabel)}</span>`;
  return `<li class="role" data-role="${i}" data-n="${r.state.n}" data-l="${r.state.l}" data-m="${r.state.m}">
          <article class="role__card">
            <header class="role__head">
              <p class="role__state"><span class="role__orbital">${esc(r.state.label)}<sub>${esc(sub)}</sub></span><span class="role__energy">E<sub>${r.state.n}</sub> = ${num(
                E,
                2,
                loc,
              )} ${ui.eV}</span></p>
              <h3 class="role__title">${esc(r.title)}</h3>
              <p class="role__meta"><time datetime="${r.start}">${esc(r.startLabel)}</time> – ${end}${r.position ? ` <span class="role__sep" aria-hidden="true">·</span> <span class="role__position">${esc(r.position)}</span>` : ''}</p>
            </header>
            <div class="role__groups">${groups}</div>
            ${transition}
          </article>
        </li>`;
}

export function renderBody(loc: Locale = 'en'): string {
  const ui = UI[loc];
  const t = site.text[loc];
  const { hero, about, experience, chapters, person, footer } = t;
  const roles = rolesFor(loc);
  const links = contactLinks(site.links, loc);
  const linkedin = links.find((l) => l.id === 'linkedin');
  const rail = chapters
    .map(
      (c, i) =>
        `<li><a href="#${site.chapterIds[i]}" data-rail="${i}"><span class="rail__num">${c.numeral}</span><span class="rail__title">${esc(c.title)}</span></a></li>`,
    )
    .join('');
  const other = LOCALES.find((l) => l !== loc)!;

  return `
  <a class="skip" href="#main">${esc(ui.skip)}</a>
  <canvas class="gl" id="gl" aria-hidden="true"></canvas>
  <div class="poster" aria-hidden="true"></div>
  <div class="loader" id="loader" role="status" aria-live="polite">
    <svg class="loader__wave" viewBox="0 0 480 140" aria-hidden="true"><path class="loader__envelope" d="" /><path class="loader__psi" d="" /></svg>
    <p class="loader__label"><span class="loader__text">${esc(ui.loader)}</span><span class="loader__pct" data-loader-pct>0%</span></p>
  </div>

  <header class="hud" aria-label="${esc(person.name)}">
    <div class="hud__left">
      <a class="hud__brand" href="#horizon" aria-label="${esc(person.name)} — ${esc(ui.backToTop)}"><span class="hud__mono" aria-hidden="true">${loc === 'ru' ? 'ДМ' : 'DM'}</span><span class="hud__name">${esc(person.name)}</span></a>
      <a class="hud__lang" href="${LOCALE_PATH[other]}" hreflang="${other}" lang="${other}" aria-label="${esc(ui.lang.aria)}" data-lang-switch>${ui.lang.label}</a>
    </div>
    <p class="hud__chapter" aria-hidden="true"><span class="hud__numeral" data-hud-numeral>I</span><span class="hud__of">/ IV</span><span class="hud__title" data-hud-title>${esc(chapters[0]!.title)}</span></p>
    <div class="hud__scale" aria-hidden="true"><span class="hud__scale-label">${esc(ui.fieldOfView)}</span><span class="hud__scale-exp" data-scale-exp>10<sup>${num(14.8, 1, loc)}</sup> ${ui.units.m}</span><span class="hud__scale-human" data-scale-human>≈ 3${'\u202f'}900 ${ui.units.au}</span></div>
  </header>

  <div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <nav class="rail" aria-label="${esc(ui.chaptersNav)}"><ol>${rail}</ol></nav>
  <aside class="readouts" aria-hidden="true"><dl data-readouts></dl></aside>
  <button class="observe-fab js-only" type="button" data-observe hidden>${esc(ui.observe)}</button>

  <main id="main">
    <section class="chapter hero" id="horizon" aria-labelledby="hero-title">
      <div class="hero__sticky">
        <div class="hero__content">
          <h1 class="hero__name" id="hero-title"><span class="hero__first" data-split>${esc(person.givenName)}</span> <span class="hero__last" data-split>${esc(
            person.familyName,
          )}</span></h1>
          <p class="hero__role" data-reveal><span>&gt; ${esc(person.jobTitle)}</span><span>&gt; ${esc(person.location)}</span>${
            linkedin ? `<a class="hero__link" href="${esc(linkedin.href)}" target="_blank" rel="me noopener noreferrer">LinkedIn ↗</a>` : ''
          }</p>
          <div class="hero__actions" data-reveal>
            <button class="btn btn--primary js-only" type="button" data-observe hidden><span class="btn__dot" aria-hidden="true"></span>${esc(hero.observe)}</button>
            <a class="btn btn--ghost" href="#about">${esc(hero.scrollHint)} <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </div>
    </section>

    <section class="chapter about" id="about" aria-labelledby="about-title">
      <div class="about__track">
      <div class="about__sticky">
        <div class="about__content">
          <h2 class="kicker" id="about-title" data-reveal>${esc(chapters[1]!.title)}</h2>
          <p class="about__lead" data-split-lines>${esc(about.lead)}</p>
        </div>
      </div>
      </div>
      <div class="interstitial" aria-hidden="true">
        <div class="counter">
          <p class="counter__scale" data-counter-scale>10<sup>${num(13.4, 1, loc)}</sup> ${ui.units.m}</p>
          <p class="counter__object" data-counter-object>${esc(ui.objects[10]!)}</p>
        </div>
      </div>
    </section>

    <section class="chapter experience" id="experience" aria-labelledby="experience-title">
      <header class="experience__head">
        <h2 class="experience__title" id="experience-title" data-split-lines>${esc(chapters[2]!.title)}</h2>
        <p class="experience__note" data-reveal>${esc(experience.note)}</p>
      </header>
      <div class="experience__body">
        <figure class="levels" aria-labelledby="levels-caption">
          ${renderLevels(roles, loc)}
          <figcaption class="levels__caption" id="levels-caption">${ui.levels.caption}</figcaption>
        </figure>
        <div class="experience__stage" data-orbital-stage aria-hidden="true"></div>
        <ol class="roles">
        ${roles.map((r, i, all) => renderRole(r, i, all, loc)).join('\n')}
        </ol>
      </div>
    </section>

    <section class="chapter contact" id="contact" aria-labelledby="contact-title">
      <div class="zoom" aria-hidden="true">
        <div class="zoom__sticky counter">
          <p class="counter__scale" data-zoom-scale>10<sup>${num(-8.7, 1, loc)}</sup> ${ui.units.m}</p>
          <p class="counter__object" data-zoom-object>${esc(ui.objects[0]!)}</p>
        </div>
      </div>
      <div class="contact__body">
        <div class="contact__content">
          <h2 class="contact__title" id="contact-title" data-split-lines>${esc(chapters[3]!.title)}</h2>
          <ul class="links" data-reveal>${links.map((l) => `<li>${renderLink(l)}</li>`).join('')}</ul>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <p class="footer__line">© ${site.year} ${esc(person.name)} <span aria-hidden="true">·</span> ${esc(person.location)}</p>
    <a class="footer__back" href="#horizon">${esc(footer.back)} <span aria-hidden="true">↑</span></a>
  </footer>

  ${renderObservatory(loc)}`;
}

function renderObservatory(loc: Locale): string {
  const o = UI[loc].obs;
  // descriptions may contain <sub>; they come from our own UI dictionary, not user input
  const sw = (name: string, [title, text]: [string, string]) =>
    `<label class="switch"><input type="checkbox" name="${name}" checked /><span class="switch__track" aria-hidden="true"></span><span class="switch__text"><strong>${esc(title)}</strong><small>${text}</small></span></label>`;
  const range = (name: string, [title, text]: [string, string], min: number, max: number, step: number, value: number) =>
    `<label class="range"><span class="range__head"><strong>${esc(title)}</strong><output data-out="${name}"></output></span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" /><small>${text}</small></label>`;
  return `<div class="observatory" id="observatory" role="dialog" aria-modal="false" aria-labelledby="obs-title" hidden>
    <form class="obs">
      <header class="obs__head">
        <div><p class="kicker">${esc(o.kicker)}</p><h2 class="obs__title" id="obs-title">${esc(o.title)}</h2></div>
        <button class="obs__close" type="button" data-observe-close aria-label="${esc(o.closeAria)}">${esc(o.close)} <span aria-hidden="true">✕</span></button>
      </header>
      <p class="obs__hint">${o.hint}</p>
      <fieldset class="obs__group"><legend class="visually-hidden">${esc(o.legend)}</legend>
        ${sw('lensing', o.lensing)}
        ${sw('doppler', o.doppler)}
        ${sw('redshift', o.redshift)}
      </fieldset>
      ${range('temperature', o.temperature, 3000, 20000, 100, 5400)}
      ${range('inclination', o.inclination, 1, 89, 1, 84)}
      ${range('distance', o.distance, 4, 60, 0.5, 26)}
    </form>
  </div>`;
}

/** Locale served by an HTML entry, from its URL path ("/ru/index.html" → ru). */
export function localeForPath(path: string): Locale {
  return /^\/ru(\/|$)/.test(path) ? 'ru' : 'en';
}

/** Fill the <!--@head--> and <!--@body--> slots of an HTML entry for the given locale. */
export function renderPage(html: string, loc: Locale = 'en'): string {
  return html
    .replace('<!--@head-->', renderHead(loc))
    .replace('<!--@body-->', renderBody(loc))
    .replace(/<html lang="[^"]*">/, `<html lang="${loc}">`);
}
