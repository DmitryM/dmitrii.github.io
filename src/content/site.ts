/**
 * Single source of truth for every piece of text on the site, per language.
 * Rendered into index.html (en) and ru/index.html (ru) at build time — see vite.config.ts.
 *
 * Résumé facts are carried over verbatim from the previous malikov.page; the Russian version is a
 * translation (official certification titles and technology names stay in English).
 * Interface copy is deliberately plain: section names and labels only.
 */
import type { Locale } from '../i18n/index.ts';

export interface QuantumState {
  /** principal quantum number */
  n: number;
  /** orbital angular momentum quantum number */
  l: number;
  /** real-orbital magnetic index: m > 0 → cos(mφ), m < 0 → sin(|m|φ), 0 → axial */
  m: number;
  /** spectroscopic label shown in the UI */
  label: string;
}

export interface SkillGroup {
  title: string;
  items: string[];
}

/** Language-neutral facts about a role. */
export interface RoleMeta {
  /** ISO-ish start/end used for <time datetime> */
  start: string;
  end: string | null;
  /** display form, e.g. "01.2019" */
  startLabel: string;
  endLabel?: string;
  state: QuantumState;
}

/** Translatable part of a role. */
export interface RoleText {
  title: string;
  position?: string;
  /** label for an open-ended role ("present") */
  present?: string;
  groups: SkillGroup[];
}

export type Role = RoleMeta & RoleText & { endLabel: string };

export interface ContactLinks {
  /** Full URL. Leave empty to hide. */
  linkedin: string;
  /** Plain address (user@domain). Leave empty to hide. Rendered obfuscated, assembled on click. */
  email: string;
  /** GitHub username (not URL). Leave empty to hide. */
  github: string;
  /** Telegram username without @. Leave empty to hide. */
  telegram: string;
}

export interface SiteText {
  ogLocale: string;
  person: { name: string; givenName: string; familyName: string; alternateName: string; jobTitle: string; location: string; country: string };
  seo: { title: string; description: string; keywords: string };
  /** plain section names: HUD, chapter rail and section headings */
  chapters: { numeral: string; title: string }[];
  hero: { observe: string; scrollHint: string };
  about: { lead: string };
  /** one factual line explaining the atom visualisation */
  experience: { note: string; roles: RoleText[] };
  footer: { back: string };
}

const roles: RoleMeta[] = [
  { start: '2019-01', end: null, startLabel: '01.2019', state: { n: 4, l: 3, m: -2, label: '4f' } },
  { start: '2016-03', end: '2019-01', startLabel: '03.2016', endLabel: '01.2019', state: { n: 3, l: 2, m: -2, label: '3d' } },
  { start: '2005', end: null, startLabel: '2005', state: { n: 2, l: 1, m: 1, label: '2p' } },
];

const SERVICENOW_CERTS = [
  'Certified System Administrator',
  'Certified Application Developer',
  'Certified Implementation Specialist – Customer Service Management',
  'Certified Implementation Specialist – Service Provider',
];

const en: SiteText = {
  ogLocale: 'en_US',
  person: {
    name: 'Dmitrii Malikov',
    givenName: 'Dmitrii',
    familyName: 'Malikov',
    alternateName: 'Dmitry Malikov',
    jobTitle: 'Software Engineer',
    location: 'Barcelona',
    country: 'Spain',
  },
  seo: {
    title: 'Dmitrii Malikov - Software Engineer | Barcelona',
    description:
      'Experienced Software Engineer & Solution Designer based in Barcelona. Skilled in ServiceNow, Oracle Database, Automation & DevOps, Web Full Stack, and more.',
    keywords:
      'Dmitrii Malikov, Dmitry Malikov, official web site, software engineer, Barcelona, ServiceNow, Oracle Database, automation, DevOps, web development, full stack developer, IT services, software solutions, JavaScript, PHP, Python, Linux, Docker, Kubernetes, Jenkins, GitLab, Oracle APEX, PL/SQL, web technologies, portfolio, resume, professional experience, tech skills, IT professional, digital solutions, coding, developer blog',
  },
  chapters: [
    { numeral: 'I', title: 'Intro' },
    { numeral: 'II', title: 'About' },
    { numeral: 'III', title: 'Experience' },
    { numeral: 'IV', title: 'Contact' },
  ],
  hero: { observe: 'Observe the black hole', scrollHint: 'Scroll' },
  about: {
    lead: 'Software Engineer and Solution Designer based in Barcelona. Skilled in ServiceNow, Oracle Database, Automation & DevOps, Web Full Stack, and more.',
  },
  experience: {
    note: 'Each role is shown as an energy level of the hydrogen atom; moving between them emits a photon.',
    roles: [
      {
        title: 'Software Engineer',
        position: 'IT Services Automation',
        present: 'present',
        groups: [
          {
            title: 'ServiceNow',
            items: [
              ...SERVICENOW_CERTS,
              'Applications Design & Implementation',
              'ITSM, Request Management, Order Management, Service Portal, Service Bridge, CMDB, CSDM, etc.',
              'TM Forum',
            ],
          },
          { title: 'Oracle', items: ['Oracle Database, Oracle APEX', 'PL/SQL, utPLSQL', 'ORDS / REST'] },
          { title: 'Automation & DevOps', items: ['Linux, Bash', 'GitLab, Jenkins', 'Docker, Kubernetes', 'Ansible', 'HP Operations Orchestration'] },
        ],
      },
      {
        title: 'Full-Stack Developer',
        position: 'E-Commerce & Digital Marketing',
        groups: [
          {
            title: 'Web',
            items: [
              'Linux Servers, Apache, Nginx',
              'JavaScript, JQuery, Node.js, Webpack, Grunt, Gulp, Mocha',
              'PHP, Composer, Yii, Yii2, CodeIgniter',
              'Python, Django, Tornado',
              'MySQL, PostgreSQL',
              'WordPress, 1C Bitrix, OpenCart, MODx, etc',
              'HTML, CSS, SCSS, BEM, Bootstrap',
              'Git',
            ],
          },
        ],
      },
      {
        title: 'Freelancer',
        present: 'present',
        groups: [
          {
            title: 'Personal Projects',
            items: [
              'Linux Servers',
              'Delphi, Python, Java, C++',
              'PHP, Zend, Yii, Yii2, CodeIgniter',
              'JavaScript, WebSockets, Node.js, Webpack, Grunt, Gulp, Express.js',
              'HTML, CSS',
              'Selenium',
              'etc',
            ],
          },
        ],
      },
    ],
  },
  footer: { back: 'Back to top' },
};

const ru: SiteText = {
  ogLocale: 'ru_RU',
  person: {
    name: 'Дмитрий Маликов',
    givenName: 'Дмитрий',
    familyName: 'Маликов',
    alternateName: 'Dmitrii Malikov',
    jobTitle: 'Инженер-программист',
    location: 'Барселона',
    country: 'Испания',
  },
  seo: {
    title: 'Дмитрий Маликов — инженер-программист | Барселона',
    description:
      'Инженер-программист и архитектор решений из Барселоны. ServiceNow, Oracle Database, автоматизация и DevOps, full-stack веб-разработка и многое другое.',
    keywords:
      'Дмитрий Маликов, Dmitrii Malikov, инженер-программист, разработчик, Барселона, ServiceNow, Oracle Database, автоматизация, DevOps, веб-разработка, full-stack разработчик, ИТ-услуги, JavaScript, PHP, Python, Linux, Docker, Kubernetes, Jenkins, GitLab, Oracle APEX, PL/SQL, портфолио, резюме, опыт работы',
  },
  chapters: [
    { numeral: 'I', title: 'Начало' },
    { numeral: 'II', title: 'Обо мне' },
    { numeral: 'III', title: 'Опыт' },
    { numeral: 'IV', title: 'Контакты' },
  ],
  hero: { observe: 'Наблюдать чёрную дыру', scrollHint: 'Вниз' },
  about: {
    lead: 'Инженер-программист и архитектор решений из Барселоны. ServiceNow, Oracle Database, автоматизация и DevOps, full-stack веб-разработка и многое другое.',
  },
  experience: {
    note: 'Каждая роль показана как уровень энергии атома водорода; переход между ними испускает фотон.',
    roles: [
      {
        title: 'Инженер-программист',
        position: 'Автоматизация ИТ-услуг',
        present: 'наст. время',
        groups: [
          {
            title: 'ServiceNow',
            items: [
              ...SERVICENOW_CERTS,
              'Проектирование и внедрение приложений',
              'ITSM, Request Management, Order Management, Service Portal, Service Bridge, CMDB, CSDM и др.',
              'TM Forum',
            ],
          },
          { title: 'Oracle', items: ['Oracle Database, Oracle APEX', 'PL/SQL, utPLSQL', 'ORDS / REST'] },
          { title: 'Автоматизация и DevOps', items: ['Linux, Bash', 'GitLab, Jenkins', 'Docker, Kubernetes', 'Ansible', 'HP Operations Orchestration'] },
        ],
      },
      {
        title: 'Full-stack разработчик',
        position: 'Электронная коммерция и цифровой маркетинг',
        groups: [
          {
            title: 'Веб',
            items: [
              'Linux-серверы, Apache, Nginx',
              'JavaScript, jQuery, Node.js, Webpack, Grunt, Gulp, Mocha',
              'PHP, Composer, Yii, Yii2, CodeIgniter',
              'Python, Django, Tornado',
              'MySQL, PostgreSQL',
              'WordPress, 1С-Битрикс, OpenCart, MODx и др.',
              'HTML, CSS, SCSS, БЭМ, Bootstrap',
              'Git',
            ],
          },
        ],
      },
      {
        title: 'Фрилансер',
        present: 'наст. время',
        groups: [
          {
            title: 'Личные проекты',
            items: [
              'Linux-серверы',
              'Delphi, Python, Java, C++',
              'PHP, Zend, Yii, Yii2, CodeIgniter',
              'JavaScript, WebSockets, Node.js, Webpack, Grunt, Gulp, Express.js',
              'HTML, CSS',
              'Selenium',
              'и др.',
            ],
          },
        ],
      },
    ],
  },
  footer: { back: 'Наверх' },
};

export const site = {
  url: 'https://malikov.page/',
  year: 2026,
  person: {
    countryCode: 'ES',
    coords: { lat: 41.3874, lon: 2.1686 },
  },
  chapterIds: ['horizon', 'about', 'experience', 'contact'] as const,
  roles,
  links: {
    linkedin: 'https://www.linkedin.com/in/dmitrii-malikov-858640bb',
    email: '', // TODO(owner): e.g. 'name@example.com'
    github: '', // TODO(owner): GitHub username
    telegram: '', // TODO(owner): Telegram username without @
  } satisfies ContactLinks,
  text: { en, ru } satisfies Record<Locale, SiteText>,
};

/** Roles with language-neutral facts merged into the localized copy. */
export function rolesFor(loc: Locale): Role[] {
  const copy = site.text[loc].experience.roles;
  if (copy.length !== site.roles.length) throw new Error(`site.ts: ${loc} has ${copy.length} roles, expected ${site.roles.length}`);
  return site.roles.map((meta, i) => {
    const t = copy[i]!;
    return { ...meta, ...t, endLabel: meta.end ? (meta.endLabel ?? meta.end) : (t.present ?? 'present') };
  });
}

export type Site = typeof site;
