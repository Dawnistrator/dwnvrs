/**
 * Owner content. Everything personal on the public site comes from here,
 * so edits never require touching components.
 */
export const site = {
  brand: 'DWNVRS',
  owner: 'Dawn',
  role: 'Full-Stack Web Developer',
  bio: "Hello, I'm Dawn. I use AI to make apps and websites.",
  description: 'Dawn (DWNVRS) is a full-stack web developer who uses AI to make apps and websites.',

  /**
   * Skill groups for the About section.
   * Seeded with the stack this site is built on. Edit to match your real toolkit.
   */
  skills: [
    {
      title: 'Interface',
      note: 'What visitors touch',
      items: ['Astro', 'TypeScript', 'Tailwind CSS', 'Material Design 3', 'Responsive layout'],
    },
    {
      title: 'Backend and data',
      note: 'What keeps it running',
      items: ['Supabase', 'PostgreSQL', 'Row Level Security', 'Astro Actions', 'REST APIs'],
    },
    {
      title: 'Workflow',
      note: 'How it gets built',
      items: ['AI-assisted coding', 'Git', 'Vercel'],
    },
  ],
} as const;
