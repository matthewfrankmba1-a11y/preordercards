// Single source of truth for blog post metadata — the index page
// (app/blog.html) lists every entry here, and each post page pulls its own
// title/description back out by slug so the two can't drift apart. Newest
// first; add a new entry + route folder under app/blog/<slug>/page.js for
// each new post.
const BLOG_POSTS = [
  {
    slug: 'whats-coming-out-august-5-14-2026',
    title: "What's Coming Out Next (August 5–14)",
    description:
      'Thirteen Topps drops across four days — headlined by Chrome Updates Basketball on August 6 — plus six preorder windows opening on August 10 and 11. Every release in the stretch is standard checkout.',
    datePublished: '2026-08-03',
  },
  {
    slug: 'whats-coming-out-july-28-2026',
    title: "What's Coming Out This Week (July 28–31)",
    description:
      "This week's Topps drops: two EQL raffle releases on July 28 (Mint Marvel and Chrome Black Basketball), plus Tribute Baseball, Inception UEFA Club Competitions Soccer, and UFC Freedom 250.",
    datePublished: '2026-07-28',
  },
  {
    slug: 'state-of-collecting-2026',
    title: 'The State of Sports Card Collecting in 2026',
    description:
      'A quick read on the 2026 trading card market: hobby box prices, EQL raffle releases, grading trends, and the biggest Topps and Bowman drops coming the rest of the year.',
    datePublished: '2026-07-27',
  },
];

module.exports = { BLOG_POSTS };
