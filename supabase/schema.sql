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
