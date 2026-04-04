import { next } from '@vercel/edge';

/**
 * Without a trailing slash, relative script URLs in HTML resolve from / (e.g. /help-modal.js).
 * Static routing can also serve /demo as 200 without hitting Express’s redirect.
 */
export default function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/demo') {
    url.pathname = '/demo/';
    return Response.redirect(url.toString(), 308);
  }
  return next();
}

export const config = {
  matcher: '/demo',
};
