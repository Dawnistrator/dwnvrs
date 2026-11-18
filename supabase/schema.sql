-- =====================================================================
-- DWNVRS portfolio: database schema
-- Run this whole file once in Supabase Dashboard > SQL Editor.
-- Safe to re-run: every statement is idempotent.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admin allowlist
-- "Authenticated" alone is not enough: if sign-ups are ever enabled, any
-- new account would get write access. Only users listed here are admins.
-- After creating your user (Authentication > Users > Add user), run:
--   insert into public.admins (user_id) values ('<your-user-uuid>');
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

drop policy if exists "admins: read own row" on public.admins;
create policy "admins: read own row"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- security definer so policies can call it without exposing the admins table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 300),
  content text not null default '' check (char_length(content) <= 20000),
  category text not null default 'Web App' check (char_length(category) between 1 and 40),
  tech_stack text[] not null default '{}',
  thumbnail_url text,
  gallery_urls text[] not null default '{}',
  live_url text check (live_url is null or live_url ~ '^https?://'),
  repo_url text check (repo_url is null or repo_url ~ '^https?://'),
  featured boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_listing_idx
  on public.projects (published, featured desc, sort_order, created_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "projects: public read published" on public.projects;
create policy "projects: public read published"
  on public.projects for select
  to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "projects: admin insert" on public.projects;
create policy "projects: admin insert"
  on public.projects for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "projects: admin update" on public.projects;
create policy "projects: admin update"
  on public.projects for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "projects: admin delete" on public.projects;
create policy "projects: admin delete"
  on public.projects for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Social media links
-- Publicly readable when published; editable by admins only.
-- ---------------------------------------------------------------------
drop table if exists public.messages;

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (char_length(platform) between 1 and 60),
  handle text not null default '' check (char_length(handle) <= 100),
  url text not null check (char_length(url) between 4 and 500 and (url ~ '^https?://' or url ~ '^mailto:')),
  description text not null default '' check (char_length(description) <= 200),
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_links_listing_idx
  on public.social_links (published, sort_order, created_at asc);

drop trigger if exists social_links_set_updated_at on public.social_links;
create trigger social_links_set_updated_at
  before update on public.social_links
  for each row execute function public.set_updated_at();

alter table public.social_links enable row level security;

drop policy if exists "social_links: public read published" on public.social_links;
create policy "social_links: public read published"
  on public.social_links for select
  to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "social_links: admin insert" on public.social_links;
create policy "social_links: admin insert"
  on public.social_links for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "social_links: admin update" on public.social_links;
create policy "social_links: admin update"
  on public.social_links for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "social_links: admin delete" on public.social_links;
create policy "social_links: admin delete"
  on public.social_links for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Site & home page sections (singleton row 'main')
-- Publicly readable; editable by admins only.
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  id text primary key default 'main' check (id = 'main'),
  brand text not null default 'DWNVRS' check (char_length(brand) between 1 and 40),
  owner text not null default 'Dawn' check (char_length(owner) between 1 and 60),
  role text not null default 'Full-Stack Web Developer' check (char_length(role) between 1 and 80),
  meta_description text not null default 'Dawn (DWNVRS) builds modern apps and websites using Artificial Intelligence, blending product vision and design aesthetics.' check (char_length(meta_description) between 1 and 300),
  hero_eyebrow text not null default 'DWNVRS · Full-Stack Web Developer' check (char_length(hero_eyebrow) <= 100),
  hero_heading text not null default 'Full-stack apps and websites, built with AI.' check (char_length(hero_heading) between 1 and 160),
  hero_bio text not null default E'Hi, I''m Dawn,\nI build Apps & Websites using Artificial Intelligence.\nI''m a vibecoder who blends product vision, design aesthetics, and AI to build functional, modern digital products.' check (char_length(hero_bio) between 1 and 1000),
  hero_primary_cta_label text not null default 'Social media' check (char_length(hero_primary_cta_label) between 1 and 60),
  hero_primary_cta_href text not null default '/socials' check (char_length(hero_primary_cta_href) between 1 and 200 and hero_primary_cta_href ~ '^(/([^/]|$)|#|https?://|mailto:)'),
  hero_secondary_cta_label text not null default 'View projects' check (char_length(hero_secondary_cta_label) between 1 and 60),
  hero_secondary_cta_href text not null default '#projects' check (char_length(hero_secondary_cta_href) between 1 and 200 and hero_secondary_cta_href ~ '^(/([^/]|$)|#|https?://|mailto:)'),
  card_focus text not null default 'Apps & websites' check (char_length(card_focus) <= 80),
  card_workflow text not null default 'AI-assisted' check (char_length(card_workflow) <= 80),
  card_stack text not null default 'Astro, TS, Tailwind, Supabase' check (char_length(card_stack) <= 120),
  projects_heading text not null default 'Projects' check (char_length(projects_heading) between 1 and 100),
  projects_subtitle text not null default 'Selected apps and websites, with architecture notes and source links where public.' check (char_length(projects_subtitle) <= 300),
  about_heading text not null default 'About & skills' check (char_length(about_heading) between 1 and 100),
  about_paragraphs text not null default E'I build full-stack web apps and custom websites under DWNVRS, combining AI coding workflows with server-rendered TypeScript and Postgres.\n\nThe focus is keeping pages fast in the browser, moving sensitive work to the server, and backing projects with clear data models and access rules.' check (char_length(about_paragraphs) <= 2000),
  skills jsonb not null default '[{"title":"Interface","note":"What visitors touch","items":["Astro","Next.js 15","ReactJS","TypeScript","Tailwind CSS","Material Design 3","Responsive layout"]},{"title":"Backend and data","note":"What keeps it running","items":["Supabase","PostgreSQL","Row Level Security","Astro Actions","REST APIs"]},{"title":"Workflow","note":"How it gets built","items":["AI-assisted coding","Gemini","Antigravity","ORCA ADE","Git","Vercel"]}]'::jsonb
    check (jsonb_typeof(skills) = 'array'),
  socials_heading text not null default 'Social media' check (char_length(socials_heading) between 1 and 100),
  socials_subtitle text not null default 'Where to find my profiles, repositories, and updates across platforms.' check (char_length(socials_subtitle) <= 300),
  socials_cta_label text not null default 'All social links' check (char_length(socials_cta_label) between 1 and 60),
  updated_at timestamptz not null default now()
);

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;

drop policy if exists "site_content: public read" on public.site_content;
create policy "site_content: public read"
  on public.site_content for select
  to anon, authenticated
  using (true);

drop policy if exists "site_content: admin insert" on public.site_content;
create policy "site_content: admin insert"
  on public.site_content for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "site_content: admin update" on public.site_content;
create policy "site_content: admin update"
  on public.site_content for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.site_content (id) values ('main') on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Favorite items (games, movies/films, music)
-- Publicly readable when published; editable by admins only.
-- ---------------------------------------------------------------------
create table if not exists public.favorite_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('game', 'movie', 'music')),
  title text not null check (char_length(title) between 1 and 120),
  subtitle text not null default '' check (char_length(subtitle) <= 120),
  review text not null default '' check (char_length(review) <= 600),
  cover_url text check (cover_url is null or cover_url ~ '^https?://'),
  external_url text check (external_url is null or external_url ~ '^https?://'),
  accent_color text not null default '#8c52ff' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  featured boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists favorite_items_listing_idx
  on public.favorite_items (published, category, featured desc, sort_order, created_at desc);

drop trigger if exists favorite_items_set_updated_at on public.favorite_items;
create trigger favorite_items_set_updated_at
  before update on public.favorite_items
  for each row execute function public.set_updated_at();

alter table public.favorite_items enable row level security;

drop policy if exists "favorite_items: public read published" on public.favorite_items;
create policy "favorite_items: public read published"
  on public.favorite_items for select
  to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "favorite_items: admin insert" on public.favorite_items;
create policy "favorite_items: admin insert"
  on public.favorite_items for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "favorite_items: admin update" on public.favorite_items;
create policy "favorite_items: admin update"
  on public.favorite_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "favorite_items: admin delete" on public.favorite_items;
create policy "favorite_items: admin delete"
  on public.favorite_items for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: project images (public read, admin write)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  true,
  4194304, -- 4 MB, below Vercel's 4.5 MB request body limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project-images: public read" on storage.objects;
create policy "project-images: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'project-images');

drop policy if exists "project-images: admin insert" on storage.objects;
create policy "project-images: admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "project-images: admin update" on storage.objects;
create policy "project-images: admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "project-images: admin delete" on storage.objects;
create policy "project-images: admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-images' and public.is_admin());
