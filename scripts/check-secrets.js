#!/usr/bin/env node
// Scans tracked files for credentials that must never be committed.
//
// Written after two Discord webhook URLs were scraped out of this repo's
// Apps Script files: the repository is public, so anything pasted into a
// file here is published the moment it is pushed. A webhook URL is a
// credential — whoever holds it can post into the channel as that bot.
const { execSync } = require('child_process');
const fs = require('fs');

const PATTERNS = [
  { name: 'Discord webhook URL', re: /discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/ },
  { name: 'Discord bot token', re: /[MNO][\w-]{23,}\.[\w-]{6}\.[\w-]{27,}/ },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9_]{20,}/ },
  { name: 'OpenAI/Anthropic-style key', re: /\bsk-[A-Za-z0-9-]{20,}/ },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_-]{30,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

// Files that legitimately describe the shape of a secret without being one.
const ALLOW = [/^\.env\.example$/, /^scripts\/check-secrets\.js$/];

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !ALLOW.some((re) => re.test(f)));

const findings = [];
for (const file of files) {
  let text;
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2 * 1024 * 1024) continue;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable — nothing to match
  }
  text.split('\n').forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      // The match itself is never printed: a report that echoes a secret
      // is one more place it exists.
      if (re.test(line)) findings.push(`${file}:${i + 1}: ${name}`);
    }
  });
}

if (findings.length > 0) {
  console.error('Credentials found in tracked files:\n');
  findings.forEach((f) => console.error('  ' + f));
  console.error(
    '\nRotate anything already pushed — it is public and cannot be unpublished.' +
      '\nMove the value into the host environment (Render env vars, or Apps Script' +
      '\nProject Settings → Script Properties) and read it from there.'
  );
  process.exit(1);
}

console.log(`No credentials found in ${files.length} tracked files.`);
