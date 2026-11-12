import { describe, expect, it } from 'vitest';
import { contactLinks, esc, jsonLd, renderBody, renderHead, renderPage } from '../src/content/render.ts';
import { site } from '../src/content/site.ts';

const html = renderPage('<html lang="en"><head><!--@head--></head><body><!--@body--></body></html>');

describe('content rendering', () => {
  it('escapes HTML', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('contains every résumé fact from site.ts', () => {
    const body = renderBody();
    const text = (s: string) => esc(s);
    expect(body).toContain(text(site.person.givenName));
    expect(body).toContain(text(site.person.familyName));
    expect(body).toContain(text(site.about.lead));
    for (const role of site.experience.roles) {
      expect(body).toContain(text(role.title));
      expect(body).toContain(text(role.startLabel));
      if (role.position) expect(body).toContain(text(role.position));
      for (const g of role.groups) {
        expect(body).toContain(text(g.title));
        for (const item of g.items) expect(body).toContain(text(item));
      }
    }
  });

  it('keeps the original SEO metadata and canonical URL', () => {
    const head = renderHead();
    expect(head).toContain('<title>Dmitrii Malikov - Software Engineer | Barcelona</title>');
    expect(head).toContain('rel="canonical" href="https://malikov.page/"');
    expect(head).toContain('og:image" content="https://malikov.page/og.jpg"');
  });

  it('emits valid JSON-LD for a Person', () => {
    const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]!.replace(/\\u003c/g, '<'));
    expect(data['@type']).toBe('Person');
    expect(data.name).toBe(site.person.name);
    expect(data.sameAs).toContain(site.contact.links.linkedin);
    expect(jsonLd()).toEqual(data);
  });

  it('hides empty contact slots and obfuscates email', () => {
    const none = contactLinks({ linkedin: '', email: '', github: '', telegram: '' });
    expect(none).toHaveLength(0);
    const all = contactLinks({ linkedin: 'https://www.linkedin.com/in/jane-doe-123abc456', email: 'jane@example.org', github: '@jane', telegram: 'jane_t' });
    expect(all.map((l) => l.id)).toEqual(['linkedin', 'email', 'github', 'telegram']);
    const email = all.find((l) => l.id === 'email')!;
    expect(email.href).not.toContain('@');
    expect(email.email).toEqual({ u: 'enaj', d: 'gro.elpmaxe' });
    expect(all.find((l) => l.id === 'github')!.href).toBe('https://github.com/jane');
    expect(all.find((l) => l.id === 'telegram')!.href).toBe('https://t.me/jane_t');
    expect(all.find((l) => l.id === 'linkedin')!.handle).toBe('in/jane-doe');
  });

  it('never leaks a plain email address into the markup', () => {
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it('renders the energy-level diagram with one level per role and the transitions between them', () => {
    const levels = html.match(/data-level="\d"/g) ?? [];
    const transitions = html.match(/data-transition="\d"/g) ?? [];
    expect(levels).toHaveLength(site.experience.roles.length);
    expect(transitions).toHaveLength(site.experience.roles.length - 1);
    expect(html).toContain('Balmer-α');
    expect(html).toContain('Paschen-α');
  });
});
