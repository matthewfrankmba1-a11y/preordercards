// Minimal Google Analytics Data API (GA4) client using a service account.
// Implements the OAuth2 JWT-bearer flow by hand (Node's built-in crypto can
// sign RS256 directly) instead of pulling in google-auth-library/googleapis.

const crypto = require('crypto');

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GA4_SERVICE_ACCOUNT_KEY = process.env.GA4_SERVICE_ACCOUNT_KEY;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const creds = JSON.parse(GA4_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.private_key);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`GA4 auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Returns today's GA4 "active users" count so far, or null if GA4_PROPERTY_ID
// / GA4_SERVICE_ACCOUNT_KEY aren't configured, or the request fails.
async function getDailyActiveUsers() {
  if (!GA4_PROPERTY_ID || !GA4_SERVICE_ACCOUNT_KEY) return null;
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: 'today', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
      }),
    });
    if (!res.ok) {
      console.error('GA4 runReport failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const value = data.rows?.[0]?.metricValues?.[0]?.value;
    return value !== undefined ? Number(value) : 0;
  } catch (err) {
    console.error('GA4 fetch failed:', err.message);
    return null;
  }
}

module.exports = { getDailyActiveUsers };
