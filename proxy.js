import { NextResponse } from 'next/server';

// The App Router streams RSC payloads to the client via inline
// `<script>self.__next_f.push(...)</script>` tags — required for every
// client component to hydrate at all. The old Express app's CSP had a
// static script-src allowlist with no 'unsafe-inline' (it never needed
// inline scripts, since all its JS was external files), which silently
// blocks Next's own bootstrap scripts and breaks hydration entirely. A
// per-request nonce is the secure fix recommended by Next.js docs — every
// other CSP directive here is unchanged from the original, byte-for-byte.
export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' https: data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com`,
    "script-src-attr 'none'",
    "style-src 'self' https: 'unsafe-inline'",
    'upgrade-insecure-requests',
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
  ].join(';');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Applies to page routes and API routes alike (the original Express app's
// Helmet middleware ran ahead of every route, API included) — only static
// asset paths are excluded, since they carry no CSP-relevant content.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
