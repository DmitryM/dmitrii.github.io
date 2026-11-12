/**
 * Single source of truth for every piece of text on the site.
 * Rendered into index.html at build time (see vite.config.ts → siteContent()).
 *
 * Résumé facts are carried over verbatim from the previous malikov.page.
 * Chapter titles / taglines are editorial copy — edit freely.
 */

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

export interface Role {
  title: string;
  /** ISO-ish start/end used for <time datetime> */
  start: string;
  end: string | null;
  /** display form, e.g. "01.2019" */
  startLabel: string;
  endLabel: string;
  position?: string;
  groups: SkillGroup[];
  state: QuantumState;
}

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

export const site = {
  url: 'https://malikov.page/',
  lang: 'en',
  year: 2026,

  person: {
    name: 'Dmitrii Malikov',
    givenName: 'Dmitrii',
    familyName: 'Malikov',
    alternateName: 'Dmitry Malikov',
    jobTitle: 'Software Engineer',
    location: 'Barcelona',
    country: 'Spain',
    countryCode: 'ES',
    coords: { lat: 41.3874, lon: 2.1686 },
  },

  seo: {
    title: 'Dmitrii Malikov - Software Engineer | Barcelona',
    description:
      'Experienced Software Engineer & Solution Designer based in Barcelona. Skilled in ServiceNow, Oracle Database, Automation & DevOps, Web Full Stack, and more.',
    keywords:
      'Dmitrii Malikov, Dmitry Malikov, official web site, software engineer, Barcelona, ServiceNow, Oracle Database, automation, DevOps, web development, full stack developer, IT services, software solutions, JavaScript, PHP, Python, Linux, Docker, Kubernetes, Jenkins, GitLab, Oracle APEX, PL/SQL, web technologies, portfolio, resume, professional experience, tech skills, IT professional, digital solutions, coding, developer blog',
    ogImage: 'og.jpg',
    themeColor: '#05060a',
  },

  chapters: [
    { id: 'horizon', numeral: 'I', title: 'Event Horizon' },
    { id: 'about', numeral: 'II', title: 'Singularity' },
    { id: 'experience', numeral: 'III', title: 'Quantum Leaps' },
    { id: 'contact', numeral: 'IV', title: 'Contact' },
  ],

  hero: {
    kicker: 'I — Event Horizon',
    observe: 'Observe the black hole',
    scrollHint: 'Fall in',
  },

  about: {
    kicker: 'II — Singularity',
    lead: 'Software Engineer and Solution Designer based in Barcelona. Skilled in ServiceNow, Oracle Database, Automation & DevOps, Web Full Stack, and more.',
    follow: 'Please see my work experience below.',
    interstitial: 'Where general relativity ends, quantum mechanics begins.',
  },

  experience: {
    kicker: 'III — Quantum Leaps',
    title: 'A career in discrete energy levels',
    note: 'Each role is a hydrogen eigenstate. Every step down the ladder is an electric-dipole-allowed transition (Δl = ±1) and emits a photon of exactly one wavelength.',
    roles: [
      {
        title: 'Software Engineer',
        start: '2019-01',
        end: null,
        startLabel: '01.2019',
        endLabel: 'present',
        position: 'IT Services Automation',
        state: { n: 4, l: 3, m: -2, label: '4f' },
        groups: [
          {
            title: 'ServiceNow',
            items: [
              'Certified System Administrator',
              'Certified Application Developer',
              'Certified Implementation Specialist – Customer Service Management',
              'Certified Implementation Specialist – Service Provider',
              'Applications Design & Implementation',
              'ITSM, Request Management, Order Management, Service Portal, Service Bridge, CMDB, CSDM, etc.',
              'TM Forum',
            ],
          },
          {
            title: 'Oracle',
            items: ['Oracle Database, Oracle APEX', 'PL/SQL, utPLSQL', 'ORDS / REST'],
          },
          {
            title: 'Automation & DevOps',
            items: ['Linux, Bash', 'GitLab, Jenkins', 'Docker, Kubernetes', 'Ansible', 'HP Operations Orchestration'],
          },
        ],
      },
      {
        title: 'Full-Stack Developer',
        start: '2016-03',
        end: '2019-01',
        startLabel: '03.2016',
        endLabel: '01.2019',
        position: 'E-Commerce & Digital Marketing',
        state: { n: 3, l: 2, m: -2, label: '3d' },
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
        start: '2005',
        end: null,
        startLabel: '2005',
        endLabel: 'present',
        state: { n: 2, l: 1, m: 1, label: '2p' },
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
    ] satisfies Role[],
  },

  zoom: {
    caption: 'Zooming out',
  },

  contact: {
    kicker: 'IV — Contact',
    title: 'Let’s get entangled.',
    text: 'Measure one end of the link and the other responds — no matter the distance.',
    links: {
      linkedin: 'https://www.linkedin.com/in/dmitrii-malikov-858640bb',
      email: '', // TODO(owner): e.g. 'name@example.com'
      github: '', // TODO(owner): GitHub username
      telegram: '', // TODO(owner): Telegram username without @
    } satisfies ContactLinks,
  },

  footer: {
    note: 'Rendered in real time with three.js — every photon is traced along a Schwarzschild geodesic.',
    back: 'Back to the horizon',
  },
};

export type Site = typeof site;
