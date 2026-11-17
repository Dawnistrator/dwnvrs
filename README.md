# DWNVRS Portfolio

Personal portfolio and case-study site for Dawn (DWNVRS), built with Astro, TypeScript, Tailwind CSS, and Supabase using Material Design 3 dark tokens.

## Features

- Material Design 3 dark palette (`#8C52FF` seed on `#000000` surface) defined in `src/styles/m3-tokens.css` and mapped into Tailwind CSS v4 in `src/styles/global.css`.
- Home page (`/`) with asymmetric hero, interactive project category filter chips, skills overview, and a live social media links preview.
- Dedicated social media directory page (`/socials`) backed by Supabase `public.social_links`.
- Dynamic case-study pages (`/projects/[slug]`) with gallery support and clean 404/error states.
- Protected admin workspace (`/admin` and `/admin/login`) gated by middleware and a Supabase `public.admins` allowlist to create, edit, and delete projects (with image uploads) and manage social media links.

## Local Setup

1. Install dependencies:

```sh
npm install
```

2. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon/publishable key:

```sh
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Run `supabase/schema.sql` once in **Supabase Dashboard > SQL Editor** to create `admins`, `projects`, `social_links`, Row Level Security policies, and the `project-images` storage bucket.

4. Create your admin user in **Supabase Dashboard > Authentication > Users**, then grant admin access in SQL Editor:

```sql
insert into public.admins (user_id) values ('<your-user-uuid>');
```

5. Start the development server:

```sh
npm run dev
```

## Scripts

- `npm run dev` - start the local Astro dev server
- `npx astro check` - run TypeScript and Astro diagnostics
- `npm run build` - build the SSR app for Vercel (`@astrojs/vercel`)
