import { describe, expect, it } from 'vitest';
import { contactLinks, esc, jsonLd, localeForPath, renderBody, renderHead, renderPage } from '../src/content/render.ts';
import { rolesFor, site } from '../src/content/site.ts';
import { LOCALES, UI } from '../src/i18n/index.ts';

const shell = '<html lang="en"><head><!--@head--></head><body><!--@body--></body></html>';

describe('content rendering', () => {
  it('escapes HTML', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('maps entry paths to locales', () => {
    expect(localeForPath('/')).toBe('en');
    expect(localeForPath('/index.html')).toBe('en');
    expect(localeForPath('/ru/')).toBe('ru');
    expect(localeForPath('/ru/index.html')).toBe('ru');
  });

  for (const loc of LOCALES) {
    describe(loc, () => {
      const html = renderPage(shell, loc);
      const t = site.text[loc];

      it('sets the document language', () => {
        expect(html).toContain(`<html lang="${loc}">`);
      });

      it('contains every résumé fact', () => {
        const body = renderBody(loc);
        expect(body).toContain(esc(t.person.givenName));
        expect(body).toContain(esc(t.person.familyName));
        expect(body).toContain(esc(t.about.lead));
        for (const role of rolesFor(loc)) {
          expect(body).toContain(esc(role.title));
          expect(body).toContain(esc(role.startLabel));
          expect(body).toContain(esc(role.endLabel));
          if (role.position) expect(body).toContain(esc(role.position));
          for (const g of role.groups) {
            expect(body).toContain(esc(g.title));
            for (const item of g.items) expect(body).toContain(esc(item));
          }
        }
      });

      it('has the same résumé structure as English', () => {
        const a = rolesFor('en');
        const b = rolesFor(loc);
        expect(b).toHaveLength(a.length);
        b.forEach((r, i) => {
          expect(r.groups.map((g) => g.items.length)).toEqual(a[i]!.groups.map((g) => g.items.length));
          expect(r.state).toEqual(a[i]!.state);
        });
      });

      it('declares canonical and hreflang alternates', () => {
        const head = renderHead(loc);
        expect(head).toContain(`rel="canonical" href="https://malikov.page${loc === 'ru' ? '/ru/' : '/'}"`);
        expect(head).toContain('hreflang="en" href="https://malikov.page/"');
        expect(head).toContain('hreflang="ru" href="https://malikov.page/ru/"');
        expect(head).toContain('hreflang="x-default" href="https://malikov.page/"');
        expect(head).toContain(`<title>${esc(t.seo.title)}</title>`);
        expect(head).toContain(`og:image" content="https://malikov.page/${loc === 'en' ? 'og.jpg' : `og-${loc}.jpg`}"`);
      });

      it('emits valid JSON-LD for a Person', () => {
        const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
        expect(match).not.toBeNull();
        const data = JSON.parse(match![1]!.replace(/\\u003c/g, '<'));
        expect(data['@type']).toBe('Person');
        expect(data.name).toBe(t.person.name);
        expect(data.sameAs).toContain(site.links.linkedin);
        expect(jsonLd(loc)).toEqual(data);
      });

      it('links to the other language', () => {
        const other = loc === 'en' ? 'ru' : 'en';
        expect(html).toMatch(new RegExp(`data-lang-switch[^>]*>${UI[loc].lang.label}<`));
        expect(html).toContain(`hreflang="${other}" lang="${other}"`);
      });

      it('renders one energy level per role and the transitions between them', () => {
        expect(html.match(/data-level="\d"/g) ?? []).toHaveLength(site.roles.length);
        expect(html.match(/data-transition="\d"/g) ?? []).toHaveLength(site.roles.length - 1);
        expect(html).toContain(loc === 'ru' ? 'Бальмер-α' : 'Balmer-α');
        expect(html).toContain(loc === 'ru' ? '656,5 нм' : '656.5 nm');
      });

      it('never leaks a plain email address into the markup', () => {
        expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      });
    });
  }

  it('hides empty contact slots and obfuscates email', () => {
    expect(contactLinks({ linkedin: '', email: '', github: '', telegram: '' })).toHaveLength(0);
    const all = contactLinks({ linkedin: 'https://www.linkedin.com/in/jane-doe-123abc456', email: 'jane@example.org', github: '@jane', telegram: 'jane_t' }, 'ru');
    expect(all.map((l) => l.id)).toEqual(['linkedin', 'email', 'github', 'telegram']);
    const email = all.find((l) => l.id === 'email')!;
    expect(email.label).toBe('Почта');
    expect(email.href).not.toContain('@');
    expect(email.email).toEqual({ u: 'enaj', d: 'gro.elpmaxe' });
    expect(all.find((l) => l.id === 'github')!.href).toBe('https://github.com/jane');
    expect(all.find((l) => l.id === 'telegram')!.href).toBe('https://t.me/jane_t');
    expect(all.find((l) => l.id === 'linkedin')!.handle).toBe('in/jane-doe');
  });
});
