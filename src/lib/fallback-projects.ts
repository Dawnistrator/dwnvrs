import type { ProjectRow } from './database.types';

/** A project as the UI sees it. `isSample` marks built-in placeholder entries. */
export type Project = ProjectRow & { isSample?: boolean };

const now = '2026-11-18T00:00:00.000Z';

/**
 * Shown only while the `projects` table is empty or Supabase is not connected.
 * The first entry describes this site itself (true by construction).
 * The other two are clearly labelled samples so the grid and filters can be previewed.
 */
export const fallbackProjects: Project[] = [
  {
    id: 'fallback-portfolio',
    slug: 'dwnvrs-portfolio',
    title: 'DWNVRS portfolio',
    summary: 'This site: an Astro and Supabase portfolio with a Material 3 dark theme and a private dashboard for projects and social links.',
    content: [
      'The portfolio you are reading. Pages render on the server with Astro, so the public site ships almost no JavaScript: the only scripts are the project filter and the snackbar.',
      'Projects and social media links live in Supabase Postgres. Row Level Security lets anyone read published entries, while only accounts on the admin allowlist can create or edit them.',
      'The visual system is Material Design 3, seeded from #8C52FF on a pure black base. Depth comes from tonal surface steps instead of shadows, and every color, corner, and type style is a CSS token mapped into Tailwind.',
    ].join('\n\n'),
    category: 'Website',
    tech_stack: ['Astro', 'TypeScript', 'Tailwind CSS', 'Supabase'],
    thumbnail_url: null,
    gallery_urls: [],
    live_url: null,
    repo_url: null,
    featured: true,
    published: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'fallback-sample-web-app',
    slug: 'sample-web-app',
    title: 'Sample web app',
    summary: 'Placeholder entry so the grid and filters can be previewed. Publish a real project from the dashboard and this disappears.',
    content: 'This is a sample entry. It is shown only while no projects have been published yet.\n\nSign in at /admin to add your first project. Once a published project exists, every sample entry is hidden automatically.',
    category: 'Web App',
    tech_stack: ['TypeScript', 'Supabase'],
    thumbnail_url: null,
    gallery_urls: [],
    live_url: null,
    repo_url: null,
    featured: false,
    published: true,
    sort_order: 1,
    created_at: now,
    updated_at: now,
    isSample: true,
  },
  {
    id: 'fallback-sample-mobile-app',
    slug: 'sample-mobile-app',
    title: 'Sample mobile app',
    summary: 'Second placeholder, in a different category, so the filter chips have something to filter.',
    content: 'This is a sample entry. It is shown only while no projects have been published yet.\n\nSign in at /admin to add your first project. Once a published project exists, every sample entry is hidden automatically.',
    category: 'Mobile App',
    tech_stack: ['React Native', 'Supabase'],
    thumbnail_url: null,
    gallery_urls: [],
    live_url: null,
    repo_url: null,
    featured: false,
    published: true,
    sort_order: 2,
    created_at: now,
    updated_at: now,
    isSample: true,
  },
];
