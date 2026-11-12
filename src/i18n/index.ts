/**
 * Locales and interface strings. Pure data — no DOM access at import time, so it is shared by
 * the build-time renderer (Node) and the client.
 * Personal / résumé text lives in src/content/site.ts; this file only holds UI vocabulary.
 */

export type Locale = 'en' | 'ru';
export const LOCALES: readonly Locale[] = ['en', 'ru'];
export const LOCALE_PATH: Record<Locale, string> = { en: '/', ru: '/ru/' };

const MINUS = '−';
const THIN = ' '; // narrow no-break space for digit grouping

/** Locale-aware number: decimal comma for Russian, proper minus sign, grouped thousands. */
export function num(x: number, digits: number, loc: Locale): string {
  const neg = x < 0;
  let [int, frac] = Math.abs(x).toFixed(digits).split('.') as [string, string | undefined];
  if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const sep = loc === 'ru' ? ',' : '.';
  return `${neg ? MINUS : ''}${int}${frac !== undefined ? sep + frac : ''}`;
}

/** 3 significant digits, grouped. */
export function sig(x: number, loc: Locale, digits = 3): string {
  if (x >= 1000) return num(Math.round(x), 0, loc);
  const s = Number(x.toPrecision(digits));
  const d = s >= 100 ? 0 : s >= 10 ? Math.max(0, digits - 2) : digits - 1;
  return num(s, Math.min(d, (s.toString().split('.')[1] ?? '').length), loc);
}

export interface UIStrings {
  skip: string;
  backToTop: string;
  chaptersNav: string;
  fieldOfView: string;
  observe: string;
  aboutHeading: string;
  loader: string;
  loaderDone: string;
  lang: { label: string; aria: string };
  emailLabel: string;
  ogAlt: string;
  coords: (lat: number, lon: number) => string;
  levels: { title: string; ionised: string; caption: string };
  eV: string;
  series: string[];
  bands: { ultraviolet: string; visible: string; infrared: string };
  units: { pm: string; nm: string; um: string; mm: string; m: string; km: string; au: string; ly: string; kly: string; kms: string };
  objects: string[];
  readouts: { clock: string; vrot: string; flat: string; radius: string; arms: string; densityWave: string; darkHalo: string };
  obs: {
    kicker: string;
    title: string;
    close: string;
    closeAria: string;
    hint: string;
    legend: string;
    lensing: [string, string];
    doppler: [string, string];
    redshift: [string, string];
    temperature: [string, string];
    inclination: [string, string];
    distance: [string, string];
  };
}

export const UI: Record<Locale, UIStrings> = {
  en: {
    skip: 'Skip to content',
    backToTop: 'back to the top',
    chaptersNav: 'Chapters',
    fieldOfView: 'Field of view',
    observe: 'Observe',
    aboutHeading: 'About',
    loader: 'Collapsing the wavefunction',
    loaderDone: 'Observed',
    lang: { label: 'RU', aria: 'Русская версия' },
    emailLabel: 'Email',
    ogAlt: 'A ray-traced black hole with a glowing, Doppler-beamed accretion disk',
    coords: (lat, lon) => `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`,
    levels: {
      title: 'Hydrogen energy levels, one per role, with the emitted spectral lines',
      ionised: 'ionised',
      caption: 'E<sub>n</sub> = −13.6 eV / n²',
    },
    eV: 'eV',
    series: ['Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund', 'Humphreys'],
    bands: { ultraviolet: 'ultraviolet', visible: 'visible', infrared: 'infrared' },
    units: { pm: 'pm', nm: 'nm', um: 'µm', mm: 'mm', m: 'm', km: 'km', au: 'AU', ly: 'ly', kly: 'kly', kms: 'km/s' },
    objects: [
      'hydrogen atom',
      'DNA double helix',
      'virus',
      'living cell',
      'grain of sand',
      'human',
      'city',
      'Earth',
      'Sun',
      'Earth’s orbit',
      'Solar System',
      'one light-year',
      'nearest stars',
      'star-forming region',
      'spiral arm',
      'Milky Way–like galaxy',
    ],
    readouts: { clock: 'clock', vrot: 'v_rot', flat: 'flat', radius: 'R', arms: 'arms', densityWave: 'density wave, m = 2', darkHalo: 'dark matter halo' },
    obs: {
      kicker: 'Observatory',
      title: 'Schwarzschild black hole',
      close: 'Return',
      closeAria: 'Close the observatory',
      hint: 'Drag to orbit · scroll or pinch to change distance · <kbd>Esc</kbd> to return',
      legend: 'Physical effects',
      lensing: ['Gravitational lensing', 'Light follows null geodesics of the Schwarzschild metric. Off: straight lines.'],
      doppler: ['Doppler beaming', 'Gas orbits at up to c/2. Approaching light is blueshifted and boosted by δ⁴.'],
      redshift: ['Gravitational redshift', 'Photons climbing out of the well lose energy: ν∞ = ν·√(1 − r<sub>s</sub>/r).'],
      temperature: ['Disk temperature', 'Peak of the Novikov–Thorne profile, at r ≈ 4.1 r<sub>s</sub>.'],
      inclination: ['Inclination', 'Angle between the line of sight and the disk axis.'],
      distance: ['Distance', 'Inside 1.5 r<sub>s</sub> lies the photon sphere; the ISCO is at 3 r<sub>s</sub>.'],
    },
  },
  ru: {
    skip: 'Перейти к содержанию',
    backToTop: 'наверх',
    chaptersNav: 'Главы',
    fieldOfView: 'Поле зрения',
    observe: 'Наблюдать',
    aboutHeading: 'Обо мне',
    loader: 'Коллапс волновой функции',
    loaderDone: 'Измерено',
    lang: { label: 'EN', aria: 'English version' },
    emailLabel: 'Почта',
    ogAlt: 'Чёрная дыра с аккреционным диском, рассчитанная трассировкой лучей',
    coords: (lat, lon) => `${num(lat, 4, 'ru')}° с. ш., ${num(lon, 4, 'ru')}° в. д.`,
    levels: {
      title: 'Уровни энергии атома водорода — по одному на роль — и испускаемые спектральные линии',
      ionised: 'ионизация',
      caption: 'E<sub>n</sub> = −13,6 эВ / n²',
    },
    eV: 'эВ',
    series: ['Лайман', 'Бальмер', 'Пашен', 'Брэкет', 'Пфунд', 'Хамфри'],
    bands: { ultraviolet: 'ультрафиолет', visible: 'видимый свет', infrared: 'инфракрасный' },
    units: { pm: 'пм', nm: 'нм', um: 'мкм', mm: 'мм', m: 'м', km: 'км', au: 'а. е.', ly: 'св. лет', kly: 'тыс. св. лет', kms: 'км/с' },
    objects: [
      'атом водорода',
      'двойная спираль ДНК',
      'вирус',
      'живая клетка',
      'песчинка',
      'человек',
      'город',
      'Земля',
      'Солнце',
      'орбита Земли',
      'Солнечная система',
      'один световой год',
      'ближайшие звёзды',
      'область звездообразования',
      'спиральный рукав',
      'галактика вроде Млечного Пути',
    ],
    readouts: { clock: 'часы', vrot: 'v_rot', flat: 'плоская', radius: 'R', arms: 'рукава', densityWave: 'волна плотности, m = 2', darkHalo: 'гало тёмной материи' },
    obs: {
      kicker: 'Обсерватория',
      title: 'Чёрная дыра Шварцшильда',
      close: 'Назад',
      closeAria: 'Закрыть обсерваторию',
      hint: 'Тяните, чтобы облететь · колесо или щипок — расстояние · <kbd>Esc</kbd> — назад',
      legend: 'Физические эффекты',
      lensing: ['Гравитационное линзирование', 'Свет идёт по нулевым геодезическим метрики Шварцшильда. Выкл.: прямые лучи.'],
      doppler: ['Доплеровское усиление', 'Газ обращается со скоростью до c/2. Свет приближающейся стороны смещён в синее и усилен как δ⁴.'],
      redshift: ['Гравитационное красное смещение', 'Фотоны теряют энергию, выбираясь из гравитационной ямы: ν∞ = ν·√(1 − r<sub>s</sub>/r).'],
      temperature: ['Температура диска', 'Пик профиля Новикова — Торна, при r ≈ 4,1 r<sub>s</sub>.'],
      inclination: ['Наклон', 'Угол между лучом зрения и осью диска.'],
      distance: ['Расстояние', 'Внутри 1,5 r<sub>s</sub> — фотонная сфера; последняя устойчивая орбита — 3 r<sub>s</sub>.'],
    },
  },
};

/** Locale of the current document (client only). */
export function clientLocale(): Locale {
  return typeof document !== 'undefined' && document.documentElement.lang === 'ru' ? 'ru' : 'en';
}
