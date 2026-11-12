import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
// Cyrillic display face for /ru/ — only downloaded where it is used (unicode-range + font matching)
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/sections.css';
import './styles/observatory.css';
import './styles/print.css';

import { App } from './app/App';
import { Loader } from './ui/Loader';
import { Motion } from './ui/Motion';
import { Observatory } from './ui/Observatory';
import { setupContact } from './ui/Contact';

const params = new URLSearchParams(location.search);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const root = document.documentElement;

if (params.has('capture')) root.classList.add('capture');
setupContact();

const motion = new Motion(reduced);
const loader = new Loader();
motion.setupReveals();

function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl && !!gl.getExtension('EXT_color_buffer_float');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

function fallback(reason: unknown) {
  if (reason) console.warn('[gl] falling back to static rendering:', reason);
  root.classList.add('no-gl');
  root.style.setProperty('--poster', 'url(/poster.jpg)');
  loader.dismiss();
  motion.intro();
}

async function start() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
  if (!canvas || params.has('nogl') || !webgl2Available()) return fallback(params.has('nogl') ? null : 'WebGL2 unavailable');

  const app = new App(canvas, { params, reduced, scroll: () => motion.scroll(), onProgress: (p) => loader.set(p) });
  // never leave a visitor staring at a loader
  const watchdog = window.setTimeout(() => loader.set(1), 15000);
  try {
    await app.init();
  } catch (err) {
    window.clearTimeout(watchdog);
    return fallback(err);
  }
  window.clearTimeout(watchdog);

  if (params.has('debug')) Object.assign(window, { __app: app, __motion: motion });
  const observatory = new Observatory(app.blackhole, motion, canvas);
  motion.onFrame((dt) => {
    app.frame(dt);
    observatory.update();
  });
  root.classList.add('gl-ready');
  await loader.done();
  motion.intro();
  motion.refresh();
  app.director.measure();
}

void start();
