import { site } from '../config/site';
import type { Json, SiteContentRow, SkillGroup } from './database.types';

export type { SkillGroup };

export interface SiteContent {
  brand: string;
  owner: string;
  role: string;
  metaDescription: string;
  heroEyebrow: string;
  heroHeading: string;
  heroBio: string;
  heroPrimaryCtaLabel: string;
  heroPrimaryCtaHref: string;
  heroSecondaryCtaLabel: string;
  heroSecondaryCtaHref: string;
  cardFocus: string;
  cardWorkflow: string;
  cardStack: string;
  projectsHeading: string;
  projectsSubtitle: string;
  aboutHeading: string;
  aboutParagraphs: string;
  skills: SkillGroup[];
  socialsHeading: string;
  socialsSubtitle: string;
  socialsCtaLabel: string;
}

export type SiteContentResult =
  | { status: 'ok'; content: SiteContent }
  | {
      status: 'fallback';
      content: SiteContent;
      reason: 'not-configured' | 'empty' | 'missing-table' | 'error';
      errorMessage?: string;
    };

export const SAFE_HREF_RE = /^(\/([^/]|$)|#|https?:\/\/|mailto:)/;

export function isSafeHref(value: string): boolean {
  return SAFE_HREF_RE.test(value.trim());
}

export function parseCommaItems(raw: string, limit = 30): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, idx, all) => all.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === idx)
    .slice(0, limit);
}

export function parseAboutParagraphs(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const defaultSiteContent: SiteContent = {
  brand: site.brand,
  owner: site.owner,
  role: site.role,
  metaDescription: site.description,
  heroEyebrow: site.hero.eyebrow,
  heroHeading: site.hero.heading,
  heroBio: site.bio,
  heroPrimaryCtaLabel: site.hero.primaryCtaLabel,
  heroPrimaryCtaHref: site.hero.primaryCtaHref,
  heroSecondaryCtaLabel: site.hero.secondaryCtaLabel,
  heroSecondaryCtaHref: site.hero.secondaryCtaHref,
  cardFocus: site.card.focus,
  cardWorkflow: site.card.workflow,
  cardStack: site.card.stack,
  projectsHeading: site.projectsSection.heading,
  projectsSubtitle: site.projectsSection.subtitle,
  aboutHeading: site.about.heading,
  aboutParagraphs: site.about.paragraphs,
  skills: site.skills.map((group) => ({
    title: group.title,
    note: group.note,
    items: [...group.items],
  })),
  socialsHeading: site.socialsSection.heading,
  socialsSubtitle: site.socialsSection.subtitle,
  socialsCtaLabel: site.socialsSection.ctaLabel,
};

export function parseSkillGroups(value: Json | undefined): SkillGroup[] {
  if (!Array.isArray(value)) return defaultSiteContent.skills;

  const parsed: SkillGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const note = typeof raw.note === 'string' ? raw.note.trim() : '';
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (title) {
      parsed.push({ title, note, items });
    }
  }

  return parsed.length > 0 ? parsed : defaultSiteContent.skills;
}

export function normalizeSiteContent(row: Partial<SiteContentRow> | null | undefined): SiteContent {
  if (!row) return defaultSiteContent;

  const pick = (val: string | null | undefined, fallback: string, allowEmpty = false): string => {
    if (typeof val !== 'string') return fallback;
    return allowEmpty ? val : val.trim() || fallback;
  };

  return {
    brand: pick(row.brand, defaultSiteContent.brand),
    owner: pick(row.owner, defaultSiteContent.owner),
    role: pick(row.role, defaultSiteContent.role),
    metaDescription: pick(row.meta_description, defaultSiteContent.metaDescription),
    heroEyebrow: pick(row.hero_eyebrow, defaultSiteContent.heroEyebrow, true),
    heroHeading: pick(row.hero_heading, defaultSiteContent.heroHeading),
    heroBio: pick(row.hero_bio, defaultSiteContent.heroBio),
    heroPrimaryCtaLabel: pick(row.hero_primary_cta_label, defaultSiteContent.heroPrimaryCtaLabel),
    heroPrimaryCtaHref: isSafeHref(row.hero_primary_cta_href ?? '')
      ? row.hero_primary_cta_href!.trim()
      : defaultSiteContent.heroPrimaryCtaHref,
    heroSecondaryCtaLabel: pick(row.hero_secondary_cta_label, defaultSiteContent.heroSecondaryCtaLabel),
    heroSecondaryCtaHref: isSafeHref(row.hero_secondary_cta_href ?? '')
      ? row.hero_secondary_cta_href!.trim()
      : defaultSiteContent.heroSecondaryCtaHref,
    cardFocus: pick(row.card_focus, defaultSiteContent.cardFocus, true),
    cardWorkflow: pick(row.card_workflow, defaultSiteContent.cardWorkflow, true),
    cardStack: pick(row.card_stack, defaultSiteContent.cardStack, true),
    projectsHeading: pick(row.projects_heading, defaultSiteContent.projectsHeading),
    projectsSubtitle: pick(row.projects_subtitle, defaultSiteContent.projectsSubtitle, true),
    aboutHeading: pick(row.about_heading, defaultSiteContent.aboutHeading),
    aboutParagraphs: pick(row.about_paragraphs, defaultSiteContent.aboutParagraphs, true),
    skills: parseSkillGroups(row.skills),
    socialsHeading: pick(row.socials_heading, defaultSiteContent.socialsHeading),
    socialsSubtitle: pick(row.socials_subtitle, defaultSiteContent.socialsSubtitle, true),
    socialsCtaLabel: pick(row.socials_cta_label, defaultSiteContent.socialsCtaLabel),
  };
}

function isMissingTableError(code: string | undefined, message: string): boolean {
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(message)
  );
}

/** Resolve site & home page sections once per request, falling back seamlessly to built-in config. */
export function resolveSiteContent(locals: App.Locals): Promise<SiteContentResult> {
  if (!locals.siteContent) {
    locals.siteContent = (async () => {
      const supabase = locals.supabase;
      if (!supabase) {
        return { status: 'fallback', content: defaultSiteContent, reason: 'not-configured' };
      }

      const { data, error } = await supabase
        .from('site_content')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error.code, error.message)) {
          return {
            status: 'fallback',
            content: defaultSiteContent,
            reason: 'missing-table',
            errorMessage: error.message,
          };
        }
        console.error('[site-content] read failed:', error.message);
        return {
          status: 'fallback',
          content: defaultSiteContent,
          reason: 'error',
          errorMessage: error.message,
        };
      }

      if (!data) {
        return { status: 'fallback', content: defaultSiteContent, reason: 'empty' };
      }

      return { status: 'ok', content: normalizeSiteContent(data) };
    })();
  }
  return locals.siteContent;
}
