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
      'A personal developer portfolio built with Material Design 3 tonal surfaces and server-first rendering.',
      'Architecture & Backend',
      '- **Server-Rendered Astro:** Public routes render on the server via Astro with the Vercel adapter, keeping client-side scripts focused on category filtering, navigation scrolling, and snackbar feedback.',
      '- **Supabase Postgres & RLS:** Projects and social media links live in Supabase Postgres, where Row Level Security allows public reads on published entries while restricting writes to the admin allowlist.',
      '- **Admin Workspace:** Protected dashboard for managing project details, ordering, featured highlights, and social links with Zod validation.',
      'Design System',
      '- **Material Design 3 Dark Tones:** Built around an `#8C52FF` brand accent on a `#141218` dark canvas, using tonal container steps instead of heavy shadows and CSS tokens mapped into Tailwind.',
      '- **Scannable Case Studies:** Supports structured section subheadings, bold lead-in highlights, clean circular list markers, and balanced reading line length.',
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
