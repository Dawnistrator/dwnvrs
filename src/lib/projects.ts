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

export type TextRun =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string };

export type CaseStudyBlock =
  | { kind: 'heading'; runs: TextRun[] }
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'unordered-list'; items: TextRun[][] }
  | { kind: 'ordered-list'; items: TextRun[][] };

const BULLET_LINE_RE = /^\s*(?:[-*•◦○▪‣])\s+(.+)$/;
const ORDERED_LINE_RE = /^\s*\d+[.)]\s+(.+)$/;
const EXPLICIT_HEADING_RE = /^\s*#{1,6}\s+(.+?)\s*#*$/;
const BOLD_HEADING_RE = /^\s*\*\*([^*]+?)\*\*:?\s*$/;

function isStructuredMarker(line: string): boolean {
  return (
    BULLET_LINE_RE.test(line) ||
    ORDERED_LINE_RE.test(line) ||
    EXPLICIT_HEADING_RE.test(line) ||
    BOLD_HEADING_RE.test(line)
  );
}

function nextNonEmptyLine(lines: string[], startIndex: number): { line: string; gap: number } | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed) {
      return { line: trimmed, gap: i - startIndex };
    }
  }
  return null;
}

function isImplicitHeading(lines: string[], index: number): boolean {
  const trimmed = lines[index].trim();
  if (!trimmed || trimmed.length > 80 || isStructuredMarker(trimmed)) {
    return false;
  }
  if (/[.!?,;]$/.test(trimmed)) {
    return false;
  }

  const next = nextNonEmptyLine(lines, index + 1);
  if (!next) {
    return false;
  }
  if (trimmed.endsWith(':')) {
    return true;
  }
  if ((BULLET_LINE_RE.test(next.line) || ORDERED_LINE_RE.test(next.line)) && next.gap <= 1) {
    return true;
  }

  const hasBlankBefore = index === 0 || !lines[index - 1].trim();
  const hasBlankAfter = next.gap >= 1;
  return hasBlankBefore && hasBlankAfter && trimmed.length <= 55;
}

function parseInlineTokens(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const tokenRe = /\*\*([^*]+?)\*\*|`([^`]+?)`/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenRe)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      runs.push({ kind: 'text', value: text.slice(lastIndex, index) });
    }
    if (match[1] !== undefined) {
      runs.push({ kind: 'bold', value: match[1] });
    } else if (match[2] !== undefined) {
      runs.push({ kind: 'code', value: match[2] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return runs.length > 0 ? runs : [{ kind: 'text', value: text }];
}

function parseInlineRuns(text: string, allowAutoLeadIn = false): TextRun[] {
  if (allowAutoLeadIn && !/^\s*(?:\*\*|`)/.test(text)) {
    const leadInMatch = text.match(/^([^:.\n,;]{2,60}:)(\s+.+)$/);
    if (leadInMatch) {
      const label = leadInMatch[1].slice(0, -1).trim();
      const wordCount = label.split(/\s+/).length;
      const isScheme = /^(?:https?|mailto|ftp|tel)$/i.test(label);
      const restTrimmed = leadInMatch[2].trimStart();
      const startsUpperOrShort = wordCount <= 2 || /^[A-Z0-9`"'([]/.test(restTrimmed);

      if (!isScheme && wordCount <= 7 && startsUpperOrShort) {
        return [{ kind: 'bold', value: leadInMatch[1].trim() }, ...parseInlineTokens(leadInMatch[2])];
      }
    }
  }

  return parseInlineTokens(text);
}

function consumeListItem(lines: string[], startIndex: number, initialText: string): { runs: TextRun[]; nextIndex: number } {
  let itemText = initialText.trim();
  let i = startIndex + 1;

  while (i < lines.length) {
    const cont = lines[i].trim();
    if (!cont || isStructuredMarker(lines[i]) || isImplicitHeading(lines, i)) {
      break;
    }
    itemText += ` ${cont}`;
    i += 1;
  }

  return { runs: parseInlineRuns(itemText, true), nextIndex: i };
}

/**
 * Parse plain-text case study notes into safe structured blocks and text runs.
 * Supports subheadings, bulleted lists (-, *, ○, •), numbered lists, paragraphs,
 * inline **bold**, `code`, and optional "Label: description" bold lead-ins.
 * Rendered exclusively as text nodes, never raw HTML.
 */
export function parseCaseStudy(content: string): CaseStudyBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: CaseStudyBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const explicitHeading = trimmed.match(EXPLICIT_HEADING_RE);
    if (explicitHeading) {
      blocks.push({ kind: 'heading', runs: parseInlineTokens(explicitHeading[1].trim()) });
      i += 1;
      continue;
    }

    const boldHeading = trimmed.match(BOLD_HEADING_RE);
    if (boldHeading) {
      blocks.push({ kind: 'heading', runs: [{ kind: 'bold', value: boldHeading[1].trim() }] });
      i += 1;
      continue;
    }

    if (isImplicitHeading(lines, i)) {
      blocks.push({ kind: 'heading', runs: parseInlineTokens(trimmed) });
      i += 1;
      continue;
    }

    const listMatch = rawLine.match(BULLET_LINE_RE) ?? rawLine.match(ORDERED_LINE_RE);
    if (listMatch) {
      const kind = BULLET_LINE_RE.test(rawLine) ? 'unordered-list' : 'ordered-list';
      const { runs, nextIndex } = consumeListItem(lines, i, listMatch[1]);
      i = nextIndex;
      const prev = blocks.at(-1);
      if (prev?.kind === kind) {
        prev.items.push(runs);
      } else {
        blocks.push({ kind, items: [runs] });
      }
      continue;
    }

    const paragraphParts: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const nextTrimmed = lines[i].trim();
      if (!nextTrimmed || isStructuredMarker(lines[i]) || isImplicitHeading(lines, i)) {
        break;
      }
      paragraphParts.push(nextTrimmed);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', runs: parseInlineRuns(paragraphParts.join(' '), false) });
  }

  return blocks;
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
