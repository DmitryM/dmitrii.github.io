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

/** Things a visitor can throw into the black hole (models in src/gl/chapters/blackhole/junk/models.ts). */
export const JUNK_IDS = ['pc', 'mug', 'duck', 'printer', 'bug', 'spaghetti', 'floppy', 'pager', 'nodeModules', 'calendar', 'sticky', 'laptop', 'hourglass', 'usb'] as const;
export type JunkId = (typeof JUNK_IDS)[number];

export interface JunkStrings {
  /** button that throws the next object from the edge of the view */
  throw: string;
  /** hint under the hero buttons, for mouse / touch */
  hint: string;
  hintTouch: string;
  /** log line after an object is swallowed: {name} {r} {epitaph} */
  log: string;
  /** label after the running count */
  count: string;
  /** readout: accretion rate in Eddington units */
  mdot: string;
  /** [short name, caption while it flies, epitaph in the log] */
  items: Record<JunkId, [string, string, string]>;
}

export interface UIStrings {
  skip: string;
  backToTop: string;
  chaptersNav: string;
  fieldOfView: string;
  observe: string;
  aboutHeading: string;
  loader: string;
  lang: { label: string; aria: string };
  emailLabel: string;
  ogAlt: string;
  levels: { title: string; ionised: string; caption: string };
  eV: string;
  series: string[];
  bands: { ultraviolet: string; visible: string; infrared: string };
  units: { pm: string; nm: string; um: string; mm: string; m: string; km: string; au: string; ly: string; kly: string; kms: string };
  objects: string[];
  readouts: { clock: string; vrot: string; flat: string; radius: string; arms: string; densityWave: string };
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
  junk: JunkStrings;
}

export const UI: Record<Locale, UIStrings> = {
  en: {
    skip: 'Skip to content',
    backToTop: 'back to the top',
    chaptersNav: 'Chapters',
    fieldOfView: 'Field of view',
    observe: 'Observe',
    aboutHeading: 'About',
    loader: 'Loading',
    lang: { label: 'RU', aria: 'Русская версия' },
    emailLabel: 'Email',
    ogAlt: 'A ray-traced black hole with a glowing, Doppler-beamed accretion disk',
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
    readouts: { clock: 'clock', vrot: 'v_rot', flat: 'flat', radius: 'R', arms: 'arms', densityWave: 'density wave, m = 2' },
    obs: {
      kicker: 'Observatory',
      title: 'Schwarzschild black hole',
      close: 'Return',
      closeAria: 'Close the observatory',
      hint: 'Drag to orbit · scroll or pinch to change distance · tap to throw something in · <kbd>Esc</kbd> to return',
      legend: 'Physical effects',
      lensing: ['Gravitational lensing', 'Light follows null geodesics of the Schwarzschild metric. Off: straight lines.'],
      doppler: ['Doppler beaming', 'Gas orbits at up to c/2. Approaching light is blueshifted and boosted by δ⁴.'],
      redshift: ['Gravitational redshift', 'Photons climbing out of the well lose energy: ν∞ = ν·√(1 − r<sub>s</sub>/r).'],
      temperature: ['Disk temperature', 'Peak of the Novikov–Thorne profile, at r ≈ 4.1 r<sub>s</sub>.'],
      inclination: ['Inclination', 'Angle between the line of sight and the disk axis.'],
      distance: ['Distance', 'Inside 1.5 r<sub>s</sub> lies the photon sphere; the ISCO is at 3 r<sub>s</sub>.'],
    },
    junk: {
      throw: 'Throw something in',
      hint: 'or click near the black hole · drag to fling',
      hintTouch: 'or tap near the black hole',
      log: '{name} · tidally disrupted at {r} r_s — {epitaph}',
      count: 'annihilated',
      mdot: 'Ṁ<sub>Edd</sub>',
      items: {
        pc: ['beige PC', 'the prod server under someone’s desk', 'Nobody knew what it ran.'],
        mug: ['coffee', 'cold coffee №4', 'Brewing another.'],
        duck: ['rubber duck', 'rubber duck, out of ideas', 'It listened. It understood. It’s gone.'],
        printer: ['printer', 'it was always the printer', 'Paper jam: permanent.'],
        bug: ['bug', 'bug in production', 'Annihilated. Reopened next sprint.'],
        spaghetti: ['spaghetti code', 'spaghetti code', 'Spaghettified. Finally consistent.'],
        floppy: ['floppy disk', 'unsaved changes', 'Should’ve pressed Ctrl+S.'],
        pager: ['pager', 'on-call, 3 a.m.', 'Alert resolved. Permanently.'],
        nodeModules: ['node_modules', 'node_modules (careful, heavy)', 'Heaviest object in the known universe.'],
        calendar: ['Friday', 'Friday deploy', 'Rolled back across the event horizon.'],
        sticky: ['sticky note', 'TODO: fix later', 'Later never came.'],
        laptop: ['laptop', 'works on my machine', 'Your machine is gone now.'],
        hourglass: ['estimate', 'estimate: 2 hours', 'Time dilation: estimate now ∞.'],
        usb: ['USB plug', 'USB, wrong way up (3rd try)', 'Third side fits.'],
      },
    },
  },
  ru: {
    skip: 'Перейти к содержанию',
    backToTop: 'наверх',
    chaptersNav: 'Главы',
    fieldOfView: 'Поле зрения',
    observe: 'Наблюдать',
    aboutHeading: 'Обо мне',
    loader: 'Загрузка',
    lang: { label: 'EN', aria: 'English version' },
    emailLabel: 'Почта',
    ogAlt: 'Чёрная дыра с аккреционным диском, рассчитанная трассировкой лучей',
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
    readouts: { clock: 'часы', vrot: 'v_rot', flat: 'плоская', radius: 'R', arms: 'рукава', densityWave: 'волна плотности, m = 2' },
    obs: {
      kicker: 'Обсерватория',
      title: 'Чёрная дыра Шварцшильда',
      close: 'Назад',
      closeAria: 'Закрыть обсерваторию',
      hint: 'Тяните, чтобы облететь · колесо или щипок — расстояние · касание — бросить что-нибудь · <kbd>Esc</kbd> — назад',
      legend: 'Физические эффекты',
      lensing: ['Гравитационное линзирование', 'Свет идёт по нулевым геодезическим метрики Шварцшильда. Выкл.: прямые лучи.'],
      doppler: ['Доплеровское усиление', 'Газ обращается со скоростью до c/2. Свет приближающейся стороны смещён в синее и усилен как δ⁴.'],
      redshift: ['Гравитационное красное смещение', 'Фотоны теряют энергию, выбираясь из гравитационной ямы: ν∞ = ν·√(1 − r<sub>s</sub>/r).'],
      temperature: ['Температура диска', 'Пик профиля Новикова — Торна, при r ≈ 4,1 r<sub>s</sub>.'],
      inclination: ['Наклон', 'Угол между лучом зрения и осью диска.'],
      distance: ['Расстояние', 'Внутри 1,5 r<sub>s</sub> — фотонная сфера; последняя устойчивая орбита — 3 r<sub>s</sub>.'],
    },
    junk: {
      throw: 'Бросить что-нибудь',
      hint: 'или кликните рядом с чёрной дырой · потяните, чтобы метнуть',
      hintTouch: 'или коснитесь экрана рядом с чёрной дырой',
      log: '{name} · приливный разрыв на {r} r_s — {epitaph}',
      count: 'аннигилировано',
      mdot: 'Ṁ<sub>Edd</sub>',
      items: {
        pc: ['бежевый ПК', 'прод-сервер под чьим-то столом', 'Никто не знал, что на нём крутилось.'],
        mug: ['кофе', 'остывший кофе №4', 'Завариваю следующий.'],
        duck: ['резиновая уточка', 'уточка, идеи кончились', 'Она слушала. Она поняла. Её больше нет.'],
        printer: ['принтер', 'во всём виноват принтер', 'Замятие бумаги: навсегда.'],
        bug: ['баг', 'баг в проде', 'Аннигилирован. Переоткроют в следующем спринте.'],
        spaghetti: ['спагетти-код', 'спагетти-код', 'Спагеттифицирован. Наконец-то единообразно.'],
        floppy: ['дискета', 'несохранённые изменения', 'Надо было нажать Ctrl+S.'],
        pager: ['пейджер', 'дежурство, 3 часа ночи', 'Алерт закрыт. Навсегда.'],
        nodeModules: ['node_modules', 'node_modules (осторожно, тяжёлое)', 'Самый тяжёлый объект во Вселенной.'],
        calendar: ['пятница', 'деплой в пятницу', 'Откатили за горизонт событий.'],
        sticky: ['стикер', 'TODO: поправить потом', '«Потом» так и не наступило.'],
        laptop: ['ноутбук', 'у меня всё работает', 'Твоей машины больше нет.'],
        hourglass: ['оценка', 'оценка: 2 часа', 'Замедление времени: оценка теперь ∞.'],
        usb: ['USB-штекер', 'USB не той стороной (3-я попытка)', 'Третья сторона подошла.'],
      },
    },
  },
};

/** Locale of the current document (client only). */
export function clientLocale(): Locale {
  return typeof document !== 'undefined' && document.documentElement.lang === 'ru' ? 'ru' : 'en';
}
