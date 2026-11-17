import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, resolveAdmin } from './lib/supabase';

const LOGIN_PATH = '/admin/login';

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, url } = context;

  locals.supabase = createSupabaseServerClient(context);
  locals.user = null;
  locals.isAdmin = false;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const isAdminArea = path === '/admin' || path.startsWith('/admin/');

  if (isAdminArea) {
    const { user, isAdmin } = await resolveAdmin(locals);
    locals.user = user;
    locals.isAdmin = isAdmin;

    if (path === LOGIN_PATH) {
      if (isAdmin && context.request.method === 'GET') return context.redirect('/admin');
    } else if (!isAdmin) {
      return context.redirect(LOGIN_PATH);
    }
  }

  const response = await next();

  // Admin pages and auth responses carry session data: never cache them.
  if (isAdminArea) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});
