/**
 * Owner content. Everything personal on the public site comes from here,
 * so edits never require touching components.
 */
export const site = {
  brand: 'DWNVRS',
  owner: 'Dawn',
  role: 'Full-Stack Web Developer',
  bio: [
    "Hi, I'm Dawn,",
    'I build Apps & Websites using Artificial Intelligence.',
    "I'm a vibecoder who blends product vision, design aesthetics, and AI to build functional, modern digital products.",
  ].join('\n'),
  description:
    'Dawn (DWNVRS) builds modern apps and websites using Artificial Intelligence, blending product vision and design aesthetics.',

  hero: {
    eyebrow: 'DWNVRS · Full-Stack Web Developer',
    heading: 'Full-stack apps and websites, built with AI.',
    primaryCtaLabel: 'Social media',
    primaryCtaHref: '/socials',
    secondaryCtaLabel: 'View projects',
    secondaryCtaHref: '#projects',
  },

  card: {
    focus: 'Apps & websites',
    workflow: 'AI-assisted',
    stack: 'Astro, TS, Tailwind, Supabase',
  },

  projectsSection: {
    heading: 'Projects',
    subtitle: 'Selected apps and websites, with architecture notes and source links where public.',
  },

  about: {
    heading: 'About & skills',
    paragraphs: [
      'I build full-stack web apps and custom websites under DWNVRS, combining AI coding workflows with server-rendered TypeScript and Postgres.',
      'The focus is keeping pages fast in the browser, moving sensitive work to the server, and backing projects with clear data models and access rules.',
    ].join('\n\n'),
  },

  socialsSection: {
    heading: 'Social media',
    subtitle: 'Where to find my profiles, repositories, and updates across platforms.',
    ctaLabel: 'All social links',
  },

  /**
   * Skill groups for the About section.
   * Seeded with the stack this site is built on. Edit to match your real toolkit.
   */
  skills: [
    {
      title: 'Interface',
      note: 'What visitors touch',
      items: ['Astro', 'Next.js 15', 'ReactJS', 'TypeScript', 'Tailwind CSS', 'Material Design 3', 'Responsive layout'],
    },
    {
      title: 'Backend and data',
      note: 'What keeps it running',
      items: ['Supabase', 'PostgreSQL', 'Row Level Security', 'Astro Actions', 'REST APIs'],
    },
    {
      title: 'Workflow',
      note: 'How it gets built',
      items: ['AI-assisted coding', 'Gemini', 'Antigravity', 'ORCA ADE', 'Git', 'Vercel'],
    },
  ],
} as const;
