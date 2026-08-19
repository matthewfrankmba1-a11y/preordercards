import { headers } from 'next/headers';
import HomeClient from './HomeClient';
import { getReleasesWithInterestCounts } from '../lib/releases';
import { getHomepageViews } from '../lib/pageViews';

export const metadata = {
  title: 'Topps Preorder Release Calendar | PreorderCards',
  description: 'PreorderCards tracks upcoming Topps trading card release dates and lets you register interest for free — no upfront payment. Independent, not affiliated with Topps.',
  openGraph: {
    title: 'Topps Preorder Release Calendar | PreorderCards',
    description: 'Track upcoming Topps release dates and register interest for free — no upfront payment required.',
    type: 'website',
    url: 'https://preordercards.com/',
  },
};

const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PreorderCards',
  url: 'https://preordercards.com/',
  description: 'Independent Topps trading card release-date tracker and free interest-registration service, not affiliated with Topps or any league or brand referenced on the site.',
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is PreorderCards?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PreorderCards is an independent site that tracks upcoming Topps trading card release dates and lets you register interest for free, with no upfront payment required. It is not affiliated with, endorsed by, or sponsored by Topps or any league or brand referenced on the site.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I preorder an upcoming Topps release?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Browse the release calendar on PreorderCards, open a release, choose a quantity, and register your interest with an email address or phone number. No payment is collected at registration.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a fee to register interest in a preorder?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Registering interest on PreorderCards is free. A transaction fee only applies if you later buy or sell through the PreorderCards Marketplace — see the Terms & Conditions page for the current fee structure.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens if a Topps release sells out?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PreorderCards marks sold-out releases clearly with a sold-out label and disables the registration form for that release, so availability shown on the site is always current.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is PreorderCards affiliated with Topps, Marvel, or any sports league?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. PreorderCards is an independent release-tracking and interest-registration service. It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL, the UFC, Disney, Marvel, or any other brand or league referenced on the site.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the PreorderCards Marketplace?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The PreorderCards Marketplace lets vetted, trusted sellers list factory-sealed, in-hand Topps inventory at a fixed price. Buyers register interest at that listed price — there is no bidding or offer negotiation.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does PreorderCards help verify authenticity?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Marketplace sellers are required to keep the original factory seal and the original retailer tracking number visible on every item, and buyers are vetted before a sale is completed. Full requirements are on the Terms & Conditions page.',
      },
    },
  ],
};

const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Register Interest in a Topps Preorder on PreorderCards',
  step: [
    { '@type': 'HowToStep', name: 'Browse the calendar', text: 'Browse upcoming Topps releases by date on the PreorderCards homepage, or filter by sport.' },
    { '@type': 'HowToStep', name: 'Check availability', text: "Open a release and confirm it isn't marked sold out." },
    { '@type': 'HowToStep', name: 'Choose a quantity', text: 'Select how many you want, from 1 to 10.' },
    { '@type': 'HowToStep', name: 'Enter contact info', text: 'Enter an email address or phone number.' },
    { '@type': 'HowToStep', name: 'Register interest', text: 'Click Register Interest. No payment is collected at this step.' },
  ],
};

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce');

  // Fetched server-side (rather than HomeClient fetching /api/releases on
  // mount) so the release list is present in the initial HTML — an empty
  // list that pops in after hydration was the page's biggest layout-shift
  // contributor, since everything below it (the FAQ section) jumped down
  // once the fetch resolved.
  let initialData;
  try {
    initialData = getReleasesWithInterestCounts();
  } catch {
    initialData = null;
  }

  // Server-rendered for the same reason as the release list above: the
  // footer count is in the initial HTML, so it never pops in and shifts
  // the disclaimers. The client's own visit is added to it on mount.
  let initialViews;
  try {
    initialViews = getHomepageViews();
  } catch {
    initialViews = null;
  }

  return (
    <>
      {/* The header's CSS background-image is the page's LCP element, but a
          background-image is only discovered after the browser parses
          globals.css — this preload lets the fetch start immediately from
          the initial HTML instead, matching what Lighthouse's LCP request
          discovery check wants for the header banner. */}
      <link rel="preload" as="image" href="/images/banner.webp" fetchPriority="high" />
      {/* suppressHydrationWarning: browsers scrub the nonce attribute from the
          DOM right after parsing it (a CSP security measure), so the server-
          rendered nonce vs. the client's cleared one always mismatch here —
          expected and harmless, not a real hydration bug. */}
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(HOWTO_JSONLD) }} />
      <HomeClient
        initialReleases={initialData ? initialData.releases : null}
        initialSourceNote={initialData ? initialData.sourceNote : ''}
        initialLastUpdated={initialData ? initialData.lastUpdated : ''}
        initialViews={initialViews}
      />
    </>
  );
}
