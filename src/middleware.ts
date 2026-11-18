import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, hasSupabaseAuthCookie, resolveAdmin } from './lib/supabase';

const LOGIN_PATH = '/admin/login';

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, url, request } = context;

  locals.supabase = createSupabaseServerClient(context);
  locals.user = null;
  locals.isAdmin = false;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const isAdminArea = path === '/admin' || path.startsWith('/admin/');
  const hasSessionCookie = hasSupabaseAuthCookie(request);

  if (isAdminArea || hasSessionCookie) {
    const { user, isAdmin } = await resolveAdmin(locals);
    locals.user = user;
    locals.isAdmin = isAdmin;

    if (isAdminArea) {
      if (path === LOGIN_PATH) {
        if (isAdmin && request.method === 'GET') return context.redirect('/admin');
      } else if (!isAdmin) {
        return context.redirect(LOGIN_PATH);
      }
    }
  }

  const response = await next();

  // Admin pages and authenticated responses carry session-dependent UI: never cache them publicly.
  if (isAdminArea || locals.isAdmin || hasSessionCookie) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});
