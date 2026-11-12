# malikov.page

Personal site of **Dmitrii Malikov**, Software Engineer in Barcelona. It is a real-time, scroll-driven journey across 34 orders of magnitude, rendered with three.js. The physics behind every image is real.

| Chapter | Scene | Scale |
|---|---|---|
| I · Event Horizon | Ray-traced Schwarzschild black hole | 10¹⁴ m |
| II · Singularity | The fall through the photon sphere, looking back at the shrinking sky | → 10¹³ m |
| III · Quantum Leaps | Hydrogen eigenstates: one role = one energy level | 10⁻⁹ m |
| IV · Contact | A Powers-of-Ten pull-back to a density-wave spiral galaxy | 10²¹ m |

## The physics

### Black hole (`src/gl/chapters/blackhole/blackhole.frag`)
- **Geodesics.** Each pixel traces a null geodesic of the Schwarzschild metric, written as `x'' = −(3/2) h² x / r⁵` and integrated with RK4 and an adaptive step.
- **Disk images.** The thin disk is sampled at every crossing of its mid-plane, so the primary, secondary and higher-order images all appear.
- **Photon ring.** It is supersampled only where the impact parameter is close to b = 3√3/2 r_s, about 2% of the pixels.
- **Disk physics:**
  - Emission follows a Novikov–Thorne-like flux profile with a zero-torque edge at the ISCO (3 r_s).
  - Orbits are Keplerian, with β = 0.5 at the ISCO.
  - Observed temperature is g·T and observed intensity is g⁴·I, where g = √(1 − r_s/r) / γ(1 − β·n̂).
  - Colour comes from a blackbody LUT built from the CIE 1931 colour-matching functions.
- **Sky.** The escaped ray directions are written to a second render target, and stars are evaluated at full resolution in that direction. They stay sharp at any tracer resolution and are correctly sheared into arcs near the Einstein ring.

### Atom (`src/physics/hydrogen.ts`, `src/gl/chapters/orbitals`)
- **Sampling.** |ψ_nlm|² is sampled exactly in a Web Worker: the radius from the inverse CDF of r²R_nl², the angles by rejection sampling of real spherical harmonics.
- **The ladder.** 4f_xyz → 3d_xy → 2p_x is an electric-dipole-allowed chain (Δl = ±1). Each step emits Paschen-α (1.876 µm) or Balmer-α (656.5 nm), and the colour comes from the CIE functions.

### Galaxy (`src/gl/chapters/galaxy`)
- **Old stars.** They follow a flat rotation curve, the dark-matter signature.
- **Arm population.** Young O/B stars, H II regions and dust trace two trailing log-spiral arms (pitch 13°) that rotate rigidly at the pattern speed.

The maths is unit-tested in `tests/physics.test.ts`:
- critical-impact-parameter capture
- weak-field deflection 2r_s/b
- ⟨r⟩ = (3n² − l(l+1))/2
- spectral lines
- blackbody white point

## Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics + content unit tests (vitest)
npm run test:e2e     # Playwright smoke tests against a production build
npm run typecheck
npm run build        # static site in dist/
npm run capture      # re-render public/og.jpg, og-ru.jpg, poster.jpg, apple-touch-icon.png
```

URL switches:

| Switch | Effect |
|---|---|
| `?quality=low\|medium\|high\|ultra` | Override the automatic GPU benchmark |
| `?debug` | stats-gl and lil-gui |
| `?nogl` | The static fallback |
| `?reduced` | Reduced-motion mode |
| `?capture=hero\|og\|fall\|dive\|quantum\|photon1\|galaxy…` | Deterministic frames with no UI |

## Languages

There are two static pages, built from the same shell:
- **English** at `/`, from `index.html`
- **Russian** at `/ru/`, from `ru/index.html`

Each page has `hreflang` alternates, its own `og:locale` and social card (`og.jpg`, `og-ru.jpg`), and an EN/RU switch in the header that keeps the reader's chapter.
- **Strings:** interface strings, units and number formatting (decimal comma in Russian) live in `src/i18n/index.ts`.
- **Font:** Instrument Serif has no Cyrillic, so the Russian page sets display type in Playfair Display.

## Editing content

All text lives in **`src/content/site.ts`**: shared facts (dates, links, quantum states) plus one copy block per language. At build time it's rendered into static HTML, meta tags and JSON-LD by the `siteContent()` plugin in `vite.config.ts`, so the page is complete without JavaScript and indexable.

**Contact slots.** `email`, `github` and `telegram` are empty and are hidden until you fill them in. The email address is written into the markup as reversed fragments and assembled only on interaction.

**Orbitals.** Each role's orbital comes from its `state: { n, l, m }`. The unit tests check that consecutive roles stay dipole-allowed.

## Quality and robustness
- **Tier choice.** Every device starts on the **high** tier: more ray steps, the soft disk halo, 340k particles and 2× pixel density. A GPU benchmark (timer queries, with a CPU fallback) picks the starting tracer resolution, and can upgrade to ultra or, for software renderers, step down. A dynamic-resolution controller then holds the frame rate at the display's refresh.
- **Off-screen work.** Only visible chapters render, and shaders compile asynchronously behind the loader.
- **Fallbacks:**
  - Without WebGL2 the page shows a pre-rendered poster.
  - Without JS it shows plain content.
  - `prefers-reduced-motion` gets native scrolling and no scrubbed camera moves.
  - Printing gives a clean résumé.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` runs on every push to `main`:
1. typecheck
2. unit tests
3. e2e tests
4. build
5. deploy to Pages

To switch over:
1. Push this project to the repository that currently serves **malikov.page**, replacing the old `index.html`.
2. In that repository, set **Settings → Pages → Source** to **GitHub Actions**.
3. `public/CNAME` keeps the custom domain. `dmitrii.page` keeps redirecting to it through redirect.pizza.
