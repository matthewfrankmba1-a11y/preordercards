// Replaces Helmet's security headers from the old Express server — every
// value here was captured empirically from the live Express app's actual
// response headers (curl -I) rather than reconstructed from memory, so this
// matches byte-for-byte, not just "close enough".
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "script-src 'self' https://www.googletagmanager.com",
  "script-src-attr 'none'",
  "style-src 'self' https: 'unsafe-inline'",
  'upgrade-insecure-requests',
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
].join(';');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-Download-Options', value: 'noopen' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-XSS-Protection', value: '0' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
