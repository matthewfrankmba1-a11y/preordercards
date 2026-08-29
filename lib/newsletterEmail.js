// Renders one weekly issue into the HTML + plain-text bodies Resend sends.
// Kept separate from lib/newsletter.js (which owns the list, the A/B split
// and the schedule) so the markup can be edited without touching sending
// logic. Everything is inline-styled and single-column: email clients strip
// <style> blocks and external CSS, so the site's stylesheet is no help here.

const { escapeHtml } = require('./releases');
const { SPORT_EMOJI } = require('./utils');

// Tracking URLs carry query strings, so their ampersands have to be
// entity-escaped when they land in an href — a raw "&utm_..." is parsed as
// an entity reference by strict clients and truncates the link.
function attr(url) {
  return escapeHtml(String(url));
}

function formatDayLabel(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortDate(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// "Aug 30 – Sep 5" — the window every issue's title and header carry.
function formatWindowLabel(sinceISO, untilISO) {
  return `${formatShortDate(sinceISO)} – ${formatShortDate(untilISO)}`;
}

function releaseNote(release) {
  if (release.eql) return 'Sold via EQL raffle entry, not first-come-first-served.';
  if (release.isPreorderOpenDate) return 'This date is when preorders open, not the ship date.';
  return null;
}

// The HTML body. `links` comes from lib/newsletter.js and already has every
// URL wrapped for click tracking, so nothing here builds a URL itself.
// Sections are {heading, paragraphs[]} — the same shape the blog agent
// stores and app/blog/[slug] renders, so the email and the web version of a
// week's post can't drift apart.
function renderIssueHtml(issue, links) {
  const windowLabel = formatWindowLabel(issue.weekOf, issue.untilDate);

  const releaseRows = issue.releases
    .map((release) => {
      const emoji = SPORT_EMOJI[release.sport] || '📦';
      const note = releaseNote(release);
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e6e6e6;">
            <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#8a8a8a;">
              ${escapeHtml(formatDayLabel(release.releaseDate))}
            </div>
            <div style="font-size:16px;font-weight:600;color:#141414;margin:4px 0 2px;">
              ${emoji} <a href="${attr(links.release(release))}" style="color:#141414;text-decoration:none;">${escapeHtml(release.title)}</a>
            </div>
            <div style="font-size:13px;color:#6a6a6a;">
              ${escapeHtml(release.sport)} · ${escapeHtml(release.format)}${release.eql ? ' · <span style="color:#d21f3c;font-weight:600;">EQL</span>' : ''}
            </div>
            ${release.description ? `<div style="font-size:13px;color:#4a4a4a;margin-top:6px;">${escapeHtml(release.description)}</div>` : ''}
            ${note ? `<div style="font-size:12px;color:#8a8a8a;margin-top:6px;">${escapeHtml(note)}</div>` : ''}
            <div style="margin-top:8px;">
              <a href="${attr(links.release(release))}" style="font-size:13px;color:#d21f3c;text-decoration:none;font-weight:600;">Register interest →</a>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  const sections = issue.sections
    .map(
      (section) => `
      <h2 style="font-size:17px;color:#141414;margin:26px 0 8px;">${escapeHtml(section.heading)}</h2>
      ${section.paragraphs
        .map((text) => `<p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 10px;">${escapeHtml(text)}</p>`)
        .join('')}`
    )
    .join('');

  return `<div style="margin:0;padding:0;background:#f5f5f5;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(issue.description)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          <tr>
            <td>
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#d21f3c;font-weight:700;">
                PreorderCards · ${escapeHtml(windowLabel)}
              </div>
              <h1 style="font-size:23px;line-height:1.3;color:#141414;margin:10px 0 6px;">${escapeHtml(issue.title)}</h1>
              <p style="font-size:14px;color:#6a6a6a;margin:0 0 20px;">${escapeHtml(issue.tagline)}</p>

              <p style="font-size:15px;line-height:1.6;color:#333;margin:0 0 8px;">${escapeHtml(issue.intro)}</p>

              ${
                issue.releases.length
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;">${releaseRows}</table>`
                  : '<p style="font-size:15px;line-height:1.6;color:#333;margin:16px 0;">No new releases are dated for this window yet — the calendar updates as manufacturers confirm dates.</p>'
              }

              ${sections}

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
                <tr>
                  <td style="background:#d21f3c;border-radius:6px;">
                    <a href="${attr(links.calendar)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">See the full release calendar →</a>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;color:#6a6a6a;margin:16px 0 0;">
                Prefer to read this on the web? <a href="${attr(links.webVersion)}" style="color:#d21f3c;">View this week's roundup online</a>.
                Looking for sealed product available right now? <a href="${attr(links.marketplace)}" style="color:#d21f3c;">Browse the marketplace</a>.
              </p>

              <hr style="border:none;border-top:1px solid #e6e6e6;margin:24px 0 14px;">

              <p style="font-size:12px;line-height:1.6;color:#8a8a8a;margin:0;">
                You're getting this because you signed up at preordercards.com.
                <a href="${attr(links.unsubscribe)}" style="color:#8a8a8a;">Unsubscribe</a> to stop the weekly roundup — or just reply to this email and we'll take care of it.
              </p>
              <p style="font-size:12px;line-height:1.6;color:#8a8a8a;margin:10px 0 0;">
                PreorderCards is an independent release tracker and is not affiliated with, endorsed by, or
                sponsored by Topps or any league or brand referenced here.
              </p>
              ${links.openPixel ? `<img src="${attr(links.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

// Plain-text alternative. Not a stripped-down courtesy copy — spam filters
// score multipart messages better than HTML-only ones, and it's what
// text-mode clients actually render.
function renderIssueText(issue, links) {
  const lines = [
    issue.title,
    formatWindowLabel(issue.weekOf, issue.untilDate),
    '',
    issue.intro,
    '',
  ];

  if (issue.releases.length) {
    lines.push("THIS WEEK'S RELEASES", '');
    for (const release of issue.releases) {
      lines.push(`${formatDayLabel(release.releaseDate)} — ${release.title}`);
      lines.push(`  ${release.sport} · ${release.format}${release.eql ? ' · EQL raffle entry' : ''}`);
      if (release.description) lines.push(`  ${release.description}`);
      const note = releaseNote(release);
      if (note) lines.push(`  ${note}`);
      lines.push(`  ${links.release(release)}`);
      lines.push('');
    }
  } else {
    lines.push('No new releases are dated for this window yet — the calendar updates as manufacturers confirm dates.', '');
  }

  for (const section of issue.sections) {
    lines.push(section.heading.toUpperCase());
    for (const paragraph of section.paragraphs) lines.push(paragraph, '');
  }

  lines.push(
    `Full release calendar: ${links.calendar}`,
    `Read this online: ${links.webVersion}`,
    `Marketplace (sealed product available now): ${links.marketplace}`,
    '',
    '— PreorderCards',
    '',
    `You're getting this because you signed up at preordercards.com. Unsubscribe: ${links.unsubscribe}`,
    'Or just reply to this email and we\'ll take care of it.',
    '',
    'PreorderCards is an independent release tracker and is not affiliated with Topps or any league/brand referenced.'
  );

  return lines.join('\n');
}

module.exports = { renderIssueHtml, renderIssueText, formatWindowLabel, formatDayLabel, formatShortDate };
