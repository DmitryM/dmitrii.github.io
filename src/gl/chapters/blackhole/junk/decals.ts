import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { ATLAS_SIZE, DECALS, type DecalName } from './models';

const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
const HAND = '"Instrument Serif", "Iowan Old Style", Georgia, serif';

type Ctx = CanvasRenderingContext2D;

/** Draws into one atlas cell with a local coordinate system (0,0 = cell top-left). */
function cell(ctx: Ctx, name: DecalName, draw: (w: number, h: number) => void) {
  const [x, y, w, h] = DECALS[name];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  draw(w, h);
  ctx.restore();
}

function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function paint(ctx: Ctx) {
  // blue screen of an unhappy PC
  cell(ctx, 'bsod', (w) => {
    text(ctx, ':(', 40, 150, `400 120px ${MONO}`, '#f4f7ff');
    text(ctx, 'Your PC ran into a problem', 42, 220, `500 26px ${MONO}`, '#e6edff');
    text(ctx, 'and needs to restart.', 42, 254, `500 26px ${MONO}`, '#e6edff');
    text(ctx, '0% complete', 42, 310, `500 22px ${MONO}`, '#c9d7ff');
    ctx.fillStyle = '#e6edff';
    ctx.fillRect(w - 120, 270, 70, 70);
  });

  cell(ctx, 'nodeModules', (w, h) => {
    ctx.strokeStyle = 'rgba(40,24,10,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    text(ctx, 'node_modules', w / 2, 112, `700 64px ${MONO}`, '#2a180a', 'center');
    text(ctx, '⚠ HEAVY · 4.2 GB · 31 337 files', w / 2, 168, `600 24px ${MONO}`, '#3b230f', 'center');
    // barcode
    let bx = 60;
    for (let i = 0; bx < w - 60; i++) {
      const bw = 2 + ((i * 7) % 5);
      ctx.fillStyle = '#2a180a';
      ctx.fillRect(bx, 194, bw, 40);
      bx += bw + 3 + ((i * 3) % 4);
    }
  });

  cell(ctx, 'sideUp', (w) => {
    ctx.fillStyle = '#2a180a';
    for (const cx of [70, 186]) {
      ctx.beginPath();
      ctx.moveTo(cx, 18);
      ctx.lineTo(cx + 26, 50);
      ctx.lineTo(cx + 10, 50);
      ctx.lineTo(cx + 10, 78);
      ctx.lineTo(cx - 10, 78);
      ctx.lineTo(cx - 10, 50);
      ctx.lineTo(cx - 26, 50);
      ctx.closePath();
      ctx.fill();
    }
    text(ctx, 'THIS SIDE UP', w / 2, 112, `700 24px ${MONO}`, '#2a180a', 'center');
  });

  // USB trident
  cell(ctx, 'usb', (w, h) => {
    ctx.strokeStyle = '#d8dde6';
    ctx.fillStyle = '#d8dde6';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, h - 20);
    ctx.lineTo(cx, 26);
    ctx.moveTo(cx, 84);
    ctx.lineTo(cx - 30, 62);
    ctx.lineTo(cx - 30, 48);
    ctx.moveTo(cx, 96);
    ctx.lineTo(cx + 30, 74);
    ctx.lineTo(cx + 30, 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, 12);
    ctx.lineTo(cx - 10, 28);
    ctx.lineTo(cx + 10, 28);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 30, 44, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + 22, 44, 16, 14);
    ctx.beginPath();
    ctx.arc(cx, h - 18, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  // printed page coming out of the printer
  cell(ctx, 'paper', (w) => {
    text(ctx, 'ERROR', 14, 30, `700 18px ${MONO}`, '#c62828');
    ctx.fillStyle = '#9aa0a8';
    for (let i = 0; i < 6; i++) ctx.fillRect(14, 44 + i * 13, w - 28 - ((i * 17) % 40), 5);
  });

  cell(ctx, 'friHeader', (w, h) => {
    text(ctx, 'FRIDAY', w / 2, h / 2 + 22, `800 62px ${MONO}`, '#fff7f2', 'center');
  });

  cell(ctx, 'fri', (w) => {
    text(ctx, '13', w / 2, 200, `800 190px ${MONO}`, '#1c1c1f', 'center');
    text(ctx, 'deploy @ 17:55', w / 2, 278, `italic 400 50px ${HAND}`, '#c4231c', 'center');
    ctx.strokeStyle = '#c4231c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(w / 2, 136, 132, 98, -0.08, 0, Math.PI * 2);
    ctx.stroke();
  });

  // LCD segments
  cell(ctx, 'pager', (w, h) => {
    text(ctx, 'PROD DOWN', 20, 70, `800 54px ${MONO}`, '#16210f');
    text(ctx, '03:12  ▲ P1', 22, h - 18, `700 30px ${MONO}`, '#1f2d15');
    ctx.fillStyle = 'rgba(22,33,15,0.12)';
    ctx.fillRect(0, 0, w, 6);
  });

  cell(ctx, 'floppy', (w) => {
    ctx.fillStyle = 'rgba(40,70,160,0.35)';
    for (let i = 0; i < 4; i++) ctx.fillRect(14, 70 + i * 32, w - 28, 2);
    text(ctx, 'backup_FINAL', 16, 62, `italic 400 40px ${HAND}`, '#1b2a7a');
    text(ctx, '_v3 (2).doc', 22, 100, `italic 400 40px ${HAND}`, '#1b2a7a');
    text(ctx, 'DO NOT LOSE', 18, 170, `700 22px ${MONO}`, '#c4231c');
  });

  // terminal on the laptop
  cell(ctx, 'terminal', (w) => {
    text(ctx, '$ npm start', 20, 48, `600 30px ${MONO}`, '#cfe8d6');
    text(ctx, '✓ works on', 20, 104, `700 38px ${MONO}`, '#62ff8e');
    text(ctx, '  my machine', 20, 150, `700 38px ${MONO}`, '#62ff8e');
    text(ctx, '$ ', 20, 214, `600 30px ${MONO}`, '#cfe8d6');
    ctx.fillStyle = '#cfe8d6';
    ctx.fillRect(62, 190, 18, 30);
    ctx.fillStyle = 'rgba(255,90,40,0.9)';
    ctx.fillRect(w - 64, 18, 40, 10);
  });

  cell(ctx, 'keys', (w, h) => {
    ctx.fillStyle = '#3a3f48';
    const cols = 12;
    const rows = 5;
    const kw = (w - 16) / cols;
    const kh = (h - 16) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === rows - 1 && c > 2 && c < 9) continue;
        ctx.fillRect(8 + c * kw + 2, 8 + r * kh + 2, kw - 4, kh - 4);
      }
    }
    ctx.fillRect(8 + 3 * kw + 2, 8 + (rows - 1) * kh + 2, 6 * kw - 4, kh - 4);
  });

  cell(ctx, 'todo', (w) => {
    text(ctx, 'TODO:', 34, 110, `italic 400 92px ${HAND}`, '#1d2a6b');
    text(ctx, 'fix later', 44, 206, `italic 400 78px ${HAND}`, '#1d2a6b');
    ctx.strokeStyle = '#1d2a6b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(44, 230);
    ctx.quadraticCurveTo(w / 2, 214, w - 70, 236);
    ctx.stroke();
    text(ctx, '(2019)', w - 30, 292, `italic 400 40px ${HAND}`, '#6b7280', 'right');
  });
}

/** Draws the decal atlas once the page fonts are available. */
export async function makeDecalAtlas(): Promise<CanvasTexture> {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  try {
    await Promise.all([document.fonts.load(`700 64px ${MONO}`), document.fonts.load(`italic 400 64px ${HAND}`)]);
  } catch {
    // fall back to whatever is available
  }
  paint(ctx);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}
