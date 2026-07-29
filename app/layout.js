import './globals.css';
import Script from 'next/script';
import { headers } from 'next/headers';
import { SITE_URL } from '../lib/seo';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  // `default` covers any page that sets no title of its own; `template` is
  // intentionally a bare passthrough so the pages that already spell out
  // their own full title (including the "— PreorderCards" suffix) don't end
  // up double-suffixed.
  title: {
    default: 'Topps Preorder Release Calendar | PreorderCards',
    template: '%s',
  },
  description:
    'PreorderCards tracks upcoming Topps trading card release dates and lets you register interest for free — no upfront payment. Independent, not affiliated with Topps.',
  applicationName: 'PreorderCards',
  keywords: [
    'Topps release dates',
    'trading card preorder',
    'sports card release calendar',
    'Topps preorder',
    'hobby box release dates',
  ],
  // Explicitly opt in to full indexing and rich snippet previews. Without
  // max-image-preview:large, Google renders release pages with a thumbnail
  // instead of a large image in Discover and mobile results.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce');

  return (
    <html lang="en">
      <body>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-0KK6YZP2DG"
          strategy="afterInteractive"
          nonce={nonce}
        />
        <Script src="/analytics.js" strategy="afterInteractive" nonce={nonce} />
        {children}
      </body>
    </html>
  );
}
