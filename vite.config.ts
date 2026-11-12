/// <reference types="vitest/config" />
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { renderPage } from './src/content/render.ts';

/**
 * Loads .glsl/.vert/.frag files as strings and resolves `#include "relative/path.glsl"`
 * recursively (each file is included once). three.js' own `#include <chunk>` syntax is untouched.
 */
function glsl(): Plugin {
  const SHADER = /\.(glsl|vert|frag)$/;
  let minify = false;
  return {
    name: 'glsl-include',
    enforce: 'pre',
    configResolved(cfg) {
      minify = cfg.command === 'build';
    },
    load(id) {
      const file = id.split('?')[0]!;
      if (!SHADER.test(file)) return null;
      const seen = new Set<string>([file]);
      const expand = (from: string, src: string): string =>
        src.replace(/^[ \t]*#include\s+"(.+?)"[ \t]*$/gm, (_m, rel: string) => {
          const target = path.resolve(path.dirname(from), rel);
          if (seen.has(target)) return '';
          seen.add(target);
          this.addWatchFile(target);
          return expand(target, fs.readFileSync(target, 'utf8'));
        });
      let code = expand(file, fs.readFileSync(file, 'utf8'));
      if (minify) {
        code = code
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');
      }
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

/**
 * Renders all page text from src/content/site.ts into index.html at dev/build time,
 * so the page is fully readable (and indexable) without JavaScript.
 */
function siteContent(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: 'site-content',
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html) {
      if (server) {
        const mod = (await server.ssrLoadModule('/src/content/render.ts')) as typeof import('./src/content/render.ts');
        return mod.renderPage(html);
      }
      return renderPage(html);
    },
    handleHotUpdate({ file, server: s }) {
      if (file.includes(`${path.sep}src${path.sep}content${path.sep}`)) {
        s.ws.send({ type: 'full-reload' });
        return [];
      }
      return undefined;
    },
  };
}

/** Preload the few font files the first screen needs (hashed names are only known after bundling). */
function fontPreload(): Plugin {
  const WANTED = [/instrument-serif-latin-400-normal-.*\.woff2$/, /instrument-serif-latin-400-italic-.*\.woff2$/, /inter-latin-wght-normal-.*\.woff2$/, /jetbrains-mono-latin-wght-normal-.*\.woff2$/];
  return {
    name: 'font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => WANTED.some((re) => re.test(f)));
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

export default defineConfig({
  plugins: [glsl(), siteContent(), fontPreload()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
