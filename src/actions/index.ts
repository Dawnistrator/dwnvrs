import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { slugify } from '../lib/projects';
import { isSafeHref, parseCommaItems, type SkillGroup } from '../lib/site-content';
import { PROJECT_IMAGES_BUCKET, resolveAdmin, type TypedSupabaseClient } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Vercel rejects request bodies above 4.5 MB, so cap one save a little below it. */
const MAX_UPLOAD_BYTES = 4.4 * 1024 * 1024;

async function requireAdmin(context: ActionAPIContext): Promise<TypedSupabaseClient> {
  const supabase = context.locals.supabase;
  if (!supabase) {
    throw new ActionError({ code: 'SERVICE_UNAVAILABLE', message: 'Supabase is not configured. Add the env vars from .env.example.' });
  }
  const { isAdmin } = await resolveAdmin(context.locals);
  if (!isAdmin) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Your session has ended. Sign in again to continue.' });
  }
  return supabase;
}

const optionalUrl = (label: string) =>
  z
    .url({ protocol: /^https?$/, error: `${label} must be a full link starting with https://` })
    .max(500)
    .optional();

/** Only real, non-empty files count. Browsers send an empty File when nothing was picked. */
function realFiles(files: (File | undefined)[]): File[] {
  return files.filter((f): f is File => f instanceof File && f.size > 0);
}

function assertImages(files: File[]): void {
  let total = 0;
  for (const file of files) {
    if (!IMAGE_TYPES[file.type]) {
      throw new ActionError({ code: 'UNSUPPORTED_MEDIA_TYPE', message: `"${file.name}" is not a JPG, PNG, WebP, AVIF, or GIF image.` });
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ActionError({ code: 'CONTENT_TOO_LARGE', message: `"${file.name}" is larger than 4 MB.` });
    }
    total += file.size;
  }
  if (total > MAX_UPLOAD_BYTES) {
    throw new ActionError({
      code: 'CONTENT_TOO_LARGE',
      message: 'Images in one save must total under 4.4 MB. Save fewer images now and add the rest in a second save.',
    });
  }
}

async function uploadImage(supabase: TypedSupabaseClient, file: File, folder: string): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const bucket = supabase.storage.from(PROJECT_IMAGES_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) {
    throw new ActionError({ code: 'BAD_GATEWAY', message: `Uploading "${file.name}" failed: ${error.message}` });
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Turn a public storage URL back into its object path, if it belongs to our bucket. */
function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PROJECT_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

/** Best effort: a failed cleanup leaves an orphaned file, never a broken project. */
async function removeImages(supabase: TypedSupabaseClient, urls: (string | null)[]): Promise<void> {
  const paths = urls.map((u) => (u ? storagePathFromUrl(u) : null)).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove(paths);
  if (error) console.warn('[storage] cleanup failed:', error.message);
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export const server = {
  admin: {
    login: defineAction({
      accept: 'form',
      input: z.object({
        email: z.string({ error: 'Enter your email.' }).trim().pipe(z.email('Enter a valid email address.')),
        password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.'),
      }),
      handler: async (input, context) => {
        const supabase = context.locals.supabase;
        if (!supabase) {
          throw new ActionError({ code: 'SERVICE_UNAVAILABLE', message: 'Supabase is not configured. Add the env vars from .env.example.' });
        }

        const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
        if (error) {
          throw new ActionError({ code: 'UNAUTHORIZED', message: 'That email and password combination is not correct.' });
        }

        const { data: isAdmin } = await supabase.rpc('is_admin');
        if (isAdmin !== true) {
          await supabase.auth.signOut();
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'This account does not have admin access.',
          });
        }

        context.locals.adminCheck = undefined;
        return { ok: true as const };
      },
    }),

    logout: defineAction({
      accept: 'form',
      handler: async (_input, context) => {
        await context.locals.supabase?.auth.signOut();
        return { ok: true as const };
      },
    }),

    saveProject: defineAction({
      accept: 'form',
      input: z.object({
        id: z.uuid().optional(),
        title: z.string({ error: 'Enter a title.' }).trim().min(1, 'Enter a title.').max(120, 'Keep the title under 120 characters.'),
        slug: z.string().trim().max(80, 'Keep the slug under 80 characters.').optional(),
        summary: z
          .string({ error: 'Write a one or two sentence summary.' })
          .trim()
          .min(1, 'Write a one or two sentence summary.')
          .max(300, 'Keep the summary under 300 characters.'),
        content: z.string().max(20000, 'The case study is over 20,000 characters.').optional(),
        category: z.string({ error: 'Enter a category, like Web App.' }).trim().min(1, 'Enter a category, like Web App.').max(40),
        tech_stack: z.string().max(500).optional(),
        live_url: optionalUrl('Live link'),
        repo_url: optionalUrl('Repository link'),
        featured: z.boolean(),
        published: z.boolean(),
        sort_order: z.number({ error: 'Order must be a whole number.' }).int('Order must be a whole number.').min(-9999).max(9999).optional(),
        thumbnail: z.instanceof(File).optional(),
        remove_thumbnail: z.boolean(),
        gallery: z.array(z.instanceof(File)).optional(),
        remove_gallery: z.array(z.string()).optional(),
      }),
      handler: async (input, context) => {
        const supabase = await requireAdmin(context);

        const slug = slugify(input.slug || input.title);
        if (!slug) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'The slug needs at least one letter or number.' });
        }

        let existing: { thumbnail_url: string | null; gallery_urls: string[] } | null = null;
        if (input.id) {
          const { data, error } = await supabase.from('projects').select('thumbnail_url, gallery_urls').eq('id', input.id).maybeSingle();
          if (error) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
          if (!data) throw new ActionError({ code: 'NOT_FOUND', message: 'This project no longer exists. It may have been deleted.' });
          existing = data;
        }

        const thumbnailFile = realFiles([input.thumbnail])[0];
        const galleryFiles = realFiles(input.gallery ?? []);
        assertImages(thumbnailFile ? [thumbnailFile, ...galleryFiles] : galleryFiles);

        const removedGallery = new Set(input.remove_gallery ?? []);
        const currentGallery = existing?.gallery_urls ?? [];
        const keptGallery = currentGallery.filter((url) => !removedGallery.has(url));
        const uploadedGallery = await Promise.all(galleryFiles.map((file) => uploadImage(supabase, file, slug)));

        let thumbnailUrl = existing?.thumbnail_url ?? null;
        const staleUrls: (string | null)[] = currentGallery.filter((url) => removedGallery.has(url));
        if (thumbnailFile) {
          staleUrls.push(thumbnailUrl);
          thumbnailUrl = await uploadImage(supabase, thumbnailFile, slug);
        } else if (input.remove_thumbnail) {
          staleUrls.push(thumbnailUrl);
          thumbnailUrl = null;
        }

        const techStack = parseCommaItems(input.tech_stack ?? '', 20);

        const record = {
          slug,
          title: input.title,
          summary: input.summary,
          content: (input.content ?? '').trim(),
          category: input.category,
          tech_stack: techStack,
          thumbnail_url: thumbnailUrl,
          gallery_urls: [...keptGallery, ...uploadedGallery],
          live_url: input.live_url ?? null,
          repo_url: input.repo_url ?? null,
          featured: input.featured,
          published: input.published,
          sort_order: input.sort_order ?? 0,
        };

        const query = input.id
          ? supabase.from('projects').update(record).eq('id', input.id).select('id, slug').single()
          : supabase.from('projects').insert(record).select('id, slug').single();
        const { data, error } = await query;

        if (error) {
          await removeImages(supabase, [...uploadedGallery, thumbnailFile ? thumbnailUrl : null]);
          if (error.code === '23505') {
            throw new ActionError({ code: 'CONFLICT', message: `Another project already uses the slug "${slug}". Pick a different one.` });
          }
          throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Saving failed: ${error.message}` });
        }

        await removeImages(supabase, staleUrls);
        return { id: data.id, slug: data.slug, created: !input.id };
      },
    }),

    deleteProject: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: async ({ id }, context) => {
        const supabase = await requireAdmin(context);
        const { data, error } = await supabase.from('projects').delete().eq('id', id).select('thumbnail_url, gallery_urls').maybeSingle();
        if (error) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Deleting failed: ${error.message}` });
        if (!data) throw new ActionError({ code: 'NOT_FOUND', message: 'That project was already deleted.' });
        await removeImages(supabase, [data.thumbnail_url, ...data.gallery_urls]);
        return { ok: true as const };
      },
    }),

    saveSocial: defineAction({
      accept: 'form',
      input: z.object({
        id: z.uuid().optional(),
        platform: z
          .string({ error: 'Enter a platform name, like GitHub or Instagram.' })
          .trim()
          .min(1, 'Enter a platform name, like GitHub or Instagram.')
          .max(60, 'Keep the platform name under 60 characters.'),
        handle: z.string().trim().max(100, 'Keep the handle under 100 characters.').optional(),
        url: z
          .string({ error: 'Enter the profile link.' })
          .trim()
          .max(500, 'Keep the URL under 500 characters.')
          .refine(
            (val) => {
              if (val.startsWith('mailto:')) return val.length > 7 && val.includes('@');
              try {
                const parsed = new URL(val);
                return parsed.protocol === 'https:' || parsed.protocol === 'http:';
              } catch {
                return false;
              }
            },
            'Enter a full URL starting with https:// or mailto:',
          ),
        description: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
        sort_order: z.number({ error: 'Order must be a whole number.' }).int('Order must be a whole number.').min(-9999).max(9999).optional(),
        published: z.boolean(),
      }),
      handler: async (input, context) => {
        const supabase = await requireAdmin(context);

        const record = {
          platform: input.platform,
          handle: input.handle ?? '',
          url: input.url,
          description: input.description ?? '',
          sort_order: input.sort_order ?? 0,
          published: input.published,
        };

        const query = input.id
          ? supabase.from('social_links').update(record).eq('id', input.id).select('id, platform').single()
          : supabase.from('social_links').insert(record).select('id, platform').single();
        const { data, error } = await query;

        if (error) {
          throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Saving failed: ${error.message}` });
        }

        return { id: data.id, platform: data.platform, created: !input.id };
      },
    }),

    deleteSocial: defineAction({
      accept: 'form',
      input: z.object({ id: z.uuid() }),
      handler: async ({ id }, context) => {
        const supabase = await requireAdmin(context);
        const { error } = await supabase.from('social_links').delete().eq('id', id);
        if (error) throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Deleting failed: ${error.message}` });
        return { ok: true as const };
      },
    }),

    saveSiteContent: defineAction({
      accept: 'form',
      input: z.object({
        brand: z.string({ error: 'Enter a brand name.' }).trim().min(1, 'Enter a brand name.').max(40, 'Keep brand under 40 characters.'),
        owner: z.string({ error: 'Enter the owner name.' }).trim().min(1, 'Enter the owner name.').max(60, 'Keep name under 60 characters.'),
        role: z.string({ error: 'Enter your role.' }).trim().min(1, 'Enter your role.').max(80, 'Keep role under 80 characters.'),
        meta_description: z
          .string({ error: 'Enter a site description.' })
          .trim()
          .min(1, 'Enter a site description.')
          .max(300, 'Keep description under 300 characters.'),
        hero_eyebrow: z.string().trim().max(100, 'Keep eyebrow under 100 characters.').optional(),
        hero_heading: z
          .string({ error: 'Enter a hero headline.' })
          .trim()
          .min(1, 'Enter a hero headline.')
          .max(160, 'Keep headline under 160 characters.'),
        hero_bio: z
          .string({ error: 'Enter your hero bio.' })
          .trim()
          .min(1, 'Enter your hero bio.')
          .max(1000, 'Keep bio under 1,000 characters.'),
        hero_primary_cta_label: z
          .string({ error: 'Enter primary button label.' })
          .trim()
          .min(1, 'Enter primary button label.')
          .max(60, 'Keep button label under 60 characters.'),
        hero_primary_cta_href: z
          .string({ error: 'Enter primary button link.' })
          .trim()
          .min(1, 'Enter primary button link.')
          .max(200, 'Keep link under 200 characters.')
          .refine(isSafeHref, 'Use a page path (/...), section (#...), or https:// URL.'),
        hero_secondary_cta_label: z
          .string({ error: 'Enter secondary button label.' })
          .trim()
          .min(1, 'Enter secondary button label.')
          .max(60, 'Keep button label under 60 characters.'),
        hero_secondary_cta_href: z
          .string({ error: 'Enter secondary button link.' })
          .trim()
          .min(1, 'Enter secondary button link.')
          .max(200, 'Keep link under 200 characters.')
          .refine(isSafeHref, 'Use a page path (/...), section (#...), or https:// URL.'),
        card_focus: z.string().trim().max(80, 'Keep Focus under 80 characters.').optional(),
        card_workflow: z.string().trim().max(80, 'Keep Workflow under 80 characters.').optional(),
        card_stack: z.string().trim().max(120, 'Keep Stack under 120 characters.').optional(),
        projects_heading: z
          .string({ error: 'Enter a Projects heading.' })
          .trim()
          .min(1, 'Enter a Projects heading.')
          .max(100, 'Keep heading under 100 characters.'),
        projects_subtitle: z.string().trim().max(300, 'Keep subtitle under 300 characters.').optional(),
        about_heading: z
          .string({ error: 'Enter an About heading.' })
          .trim()
          .min(1, 'Enter an About heading.')
          .max(100, 'Keep heading under 100 characters.'),
        about_paragraphs: z.string().trim().max(2000, 'Keep About text under 2,000 characters.').optional(),
        socials_heading: z
          .string({ error: 'Enter a Socials heading.' })
          .trim()
          .min(1, 'Enter a Socials heading.')
          .max(100, 'Keep heading under 100 characters.'),
        socials_subtitle: z.string().trim().max(300, 'Keep subtitle under 300 characters.').optional(),
        socials_cta_label: z
          .string({ error: 'Enter Socials button label.' })
          .trim()
          .min(1, 'Enter Socials button label.')
          .max(60, 'Keep button label under 60 characters.'),
        skill_title: z.array(z.string().trim().max(60)).optional(),
        skill_note: z.array(z.string().trim().max(120)).optional(),
        skill_items: z.array(z.string().max(600)).optional(),
      }),
      handler: async (input, context) => {
        const supabase = await requireAdmin(context);

        const titles = input.skill_title ?? [];
        const notes = input.skill_note ?? [];
        const itemLists = input.skill_items ?? [];
        const skills: SkillGroup[] = [];

        for (let idx = 0; idx < titles.length && skills.length < 12; idx += 1) {
          const title = titles[idx]?.trim() ?? '';
          if (!title) continue;
          skills.push({
            title,
            note: notes[idx]?.trim() ?? '',
            items: parseCommaItems(itemLists[idx] ?? '', 30),
          });
        }

        if (skills.length === 0) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Add at least one skill category with a title.',
          });
        }

        const record = {
          id: 'main',
          brand: input.brand,
          owner: input.owner,
          role: input.role,
          meta_description: input.meta_description,
          hero_eyebrow: input.hero_eyebrow ?? '',
          hero_heading: input.hero_heading,
          hero_bio: input.hero_bio.replace(/\r\n?/g, '\n'),
          hero_primary_cta_label: input.hero_primary_cta_label,
          hero_primary_cta_href: input.hero_primary_cta_href,
          hero_secondary_cta_label: input.hero_secondary_cta_label,
          hero_secondary_cta_href: input.hero_secondary_cta_href,
          card_focus: input.card_focus ?? '',
          card_workflow: input.card_workflow ?? '',
          card_stack: input.card_stack ?? '',
          projects_heading: input.projects_heading,
          projects_subtitle: input.projects_subtitle ?? '',
          about_heading: input.about_heading,
          about_paragraphs: (input.about_paragraphs ?? '').replace(/\r\n?/g, '\n'),
          skills: skills as unknown as import('../lib/database.types').Json,
          socials_heading: input.socials_heading,
          socials_subtitle: input.socials_subtitle ?? '',
          socials_cta_label: input.socials_cta_label,
        };

        const { error } = await supabase
          .from('site_content')
          .upsert(record, { onConflict: 'id' });

        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)) {
            throw new ActionError({
              code: 'FAILED_DEPENDENCY',
              message: 'The public.site_content table is missing in Supabase. Run the updated supabase/schema.sql in Supabase SQL Editor first.',
            });
          }
          throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Saving failed: ${error.message}` });
        }

        context.locals.siteContent = undefined;
        return { ok: true as const };
      },
    }),
  },
};
