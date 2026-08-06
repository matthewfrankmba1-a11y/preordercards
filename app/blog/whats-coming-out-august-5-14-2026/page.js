import { headers } from 'next/headers';
import { BLOG_POSTS } from '../../../lib/blogPosts';

const POST = BLOG_POSTS.find((p) => p.slug === 'whats-coming-out-august-5-14-2026');

export const metadata = {
  title: `${POST.title} — PreorderCards Blog`,
  description: POST.description,
};

const ARTICLE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: POST.title,
  description: POST.description,
  datePublished: POST.datePublished,
  dateModified: POST.datePublished,
  author: { '@type': 'Organization', name: 'PreorderCards' },
  publisher: { '@type': 'Organization', name: 'PreorderCards' },
};

export default async function WhatsComingOutAugustPost() {
  const nonce = (await headers()).get('x-nonce');

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSONLD) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{POST.title}</h1>
          <p className="tagline">Thirteen drops, six preorder windows, and not a raffle in sight.</p>
          <a className="header-nav-link" href="/blog.html">← Back to Blog</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Published August 3, 2026 · 4 min read</p>

          <p>
            The next ten days are busy. Thirteen releases land across four drop days, and in between,
            six more products open preorders ahead of later street dates. Here's everything on the
            calendar between August 5 and August 14, straight from our{' '}
            <a href="/">release calendar</a>.
          </p>

          <p>
            One thing worth flagging up front: <strong>every release in this stretch is standard
            checkout</strong>. After last week's two same-day EQL raffle drops, there's not a single
            raffle entry on the board. If you want in, you're buying at drop time like normal.
          </p>

          <h2>Wednesday, August 5 — Chrome Baseball Mega Box</h2>
          <p>
            <strong>2026 Topps Chrome Baseball</strong> arrives in its Mega Box configuration,
            following the hobby wave that has already come and gone. Worth remembering that Chrome's
            hobby and retail configurations are different products with different contents — the
            hobby prices you've been watching aren't the comp for this one.
          </p>

          <h2>Thursday, August 6 — the big day</h2>
          <p>
            The heaviest day of the stretch, and the one most worth planning around.{' '}
            <strong>2025-26 Topps Chrome Updates Basketball</strong> is the first-ever extension to
            flagship Topps Chrome Basketball, headlined by rookie debut patch autographs from the
            2025-26 NBA class. It drops in <strong>five configurations at once</strong>: Hobby,
            Jumbo, Mega, Value, and Delight.
          </p>
          <p>
            Those aren't interchangeable. The Jumbo box carries additional autograph hits per box,
            and the Delight box pairs a Chrome autograph with an exclusive Geometric-parallel
            autograph in every box. Mega and Value are the retail-facing options, with Value at the
            lower per-box price point. If you're chasing the rookie patch autos, the configuration
            you pick matters more than usual here.
          </p>
          <p>
            Landing the same day, <strong>2026 Topps Chrome Sapphire Marvel Comics</strong> applies
            Sapphire-edition Chrome parallels to the Marvel Comics universe.
          </p>

          <h2>Monday, August 10 and Tuesday, August 11 — six preorder windows open</h2>
          <p>
            No product actually ships on these two days. Instead, six releases open their preorder
            windows ahead of later street dates — worth a calendar reminder if any of them matter to
            you, since preorder windows are when allocation gets decided.
          </p>
          <p>
            On <strong>Monday the 10th</strong>: <strong>2026 Bowman Chrome Baseball</strong>, the
            Chrome-refractor edition of the flagship Bowman prospect release;{' '}
            <strong>2026 Topps WWE Universe</strong>, a retail-focused blaster release; and{' '}
            <strong>2026 Topps Wacky Packages All New Series</strong>, the newest installment of
            Topps' satirical sticker line.
          </p>
          <p>
            On <strong>Tuesday the 11th</strong>: <strong>2026 Topps Chrome MLS Soccer</strong>;{' '}
            <strong>2026-27 Topps Premier League Soccer</strong>, opening well ahead of its September
            street date; and <strong>2026 Topps Vault Marvel</strong>, a new Marvel-licensed release
            under the Vault brand with full checklist details still to be announced.
          </p>

          <h2>Wednesday, August 12 — Pristine and Star Wars Chrome Galaxy</h2>
          <p>
            <strong>2026 Topps Pristine</strong> (Hobby Box) is a premium baseball release built
            around on-card autographs and refractor parallels — the kind of product where the draw is
            hits rather than completing a base set.
          </p>
          <p>
            Alongside it, <strong>2026 Topps Star Wars Chrome Galaxy</strong> brings the Chrome
            format to the Star Wars license, spanning characters and moments from across the galaxy.
            It drops as a <strong>Hobby Box</strong> and a <strong>12-Box Case</strong> for anyone
            buying at volume.
          </p>

          <h2>Friday, August 14 — UFC Stadium Club</h2>
          <p>
            Closing out the stretch, <strong>2026 Topps UFC Stadium Club</strong> applies Stadium
            Club's photography-led design language to the UFC roster, in three configurations: Hobby,
            Mega, and Value. The Value box carries exclusive lime green parallels, so it's not just a
            cheaper way into the same product.
          </p>

          <h2>What that adds up to</h2>
          <p>
            Six products across thirteen configurations in ten days, spanning baseball, basketball,
            entertainment, and MMA — plus six preorder windows opening mid-stretch, soccer among
            them. If you sat out last week because raffle entry wasn't worth the hassle, this is the
            run to pay attention to.
          </p>

          <h2>How to get in before any of these drop</h2>
          <p>
            Register interest for free on the <a href="/">release calendar</a> — no payment
            collected upfront, and every release is clearly flagged as EQL raffle entry or standard
            checkout so you know exactly what to expect on drop day.
          </p>

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Release dates come from public trackers and can change with little notice — always
            confirm on Topps.com before buying. Questions or a release we should be tracking? Email{' '}
            <a href="mailto:admin@preordercards.com">admin@preordercards.com</a>.
          </p>

          <p style={{ marginTop: '2rem' }}>
            <a href="/">← Back to the PreorderCards homepage</a>
          </p>
        </article>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, WWE, Disney, Marvel, Lucasfilm, or any other brand or league referenced here.
            All product names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
