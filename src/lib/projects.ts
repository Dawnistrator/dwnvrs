import { fallbackProjects, type Project } from './fallback-projects';
import type { TypedSupabaseClient } from './supabase';

export type { Project };

export type ProjectsResult =
  | { status: 'ok'; projects: Project[] }
  /** Showing built-in entries: the table is empty, or Supabase is not connected. */
  | { status: 'fallback'; projects: Project[]; reason: 'empty' | 'not-configured' }
  | { status: 'error'; projects: []; message: string };

/** Published projects for the public site, featured first. */
export async function getPublishedProjects(supabase: TypedSupabaseClient | null): Promise<ProjectsResult> {
  if (!supabase) return { status: 'fallback', projects: fallbackProjects, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('published', true)
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[projects] list failed:', error.message);
    return { status: 'error', projects: [], message: error.message };
  }
  if (data.length === 0) return { status: 'fallback', projects: fallbackProjects, reason: 'empty' };
  return { status: 'ok', projects: data };
}

export type ProjectResult =
  | { status: 'ok'; project: Project }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/** One published project by slug. Built-in entries resolve only while the table is empty. */
export async function getProjectBySlug(supabase: TypedSupabaseClient | null, slug: string): Promise<ProjectResult> {
  const fallback = fallbackProjects.find((p) => p.slug === slug);

  if (!supabase) return fallback ? { status: 'ok', project: fallback } : { status: 'not-found' };

  const { data, error } = await supabase.from('projects').select('*').eq('slug', slug).eq('published', true).maybeSingle();
  if (error) {
    console.error('[projects] detail failed:', error.message);
    return { status: 'error', message: error.message };
  }
  if (data) return { status: 'ok', project: data };
  if (!fallback) return { status: 'not-found' };

  const { count, error: countError } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('published', true);
  if (countError) return { status: 'error', message: countError.message };
  return count === 0 ? { status: 'ok', project: fallback } : { status: 'not-found' };
}

/** Split plain-text content into paragraphs on blank lines. Rendered as text, never as HTML. */
export function toParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Two-letter monogram for the generated thumbnail. */
export function monogram(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
