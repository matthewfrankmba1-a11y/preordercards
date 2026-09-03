// HTTPS fetching through an authenticated HTTP proxy, using only Node
// built-ins.
//
// Node's global fetch can't be pointed at a proxy without undici's
// ProxyAgent, which would be a new dependency for one weekly job. The
// standard mechanism underneath it is small enough to do directly: open a
// socket to the proxy, ask it to CONNECT to the target host, then run TLS
// over the tunnel it opens and speak HTTP/1.1 inside that.
//
// Credentials only ever come from the environment, and nothing here logs or
// returns them — see describeProxy(), which is what callers report with.
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// One per line (or comma-separated), in the format these providers hand out:
//   host:port:username:password
// The password often carries a session identifier, which is what makes each
// entry a different exit IP — so the list is a set of sessions, not just
// duplicate credentials.
function parseProxies(raw) {
  return String(raw || '')
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // rsplit-style: the password may itself contain colons, the first
      // three fields never do.
      const parts = line.split(':');
      if (parts.length < 4) return null;
      const [host, port, username, ...rest] = parts;
      const portNumber = Number(port);
      if (!host || !Number.isInteger(portNumber) || portNumber <= 0 || !username) return null;
      return { host, port: portNumber, username, password: rest.join(':') };
    })
    .filter(Boolean);
}

// What callers are allowed to print. Entries have to be distinguishable in a
// report without the credential ever appearing, so the marker is a short
// one-way hash of the password rather than a slice of it — deriving the
// label from the password's own text leaks the whole thing whenever the
// format isn't what you assumed (a password with no separators returns
// itself), and a report that has ever printed a secret can't be un-printed.
function describeProxy(proxy, index) {
  const marker = crypto.createHash('sha256').update(String(proxy.password || '')).digest('hex').slice(0, 6);
  return `#${index + 1} ${proxy.host}:${proxy.port} (session ${marker})`;
}

function proxyAuthHeader(proxy) {
  return 'Basic ' + Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
}

// Opens the CONNECT tunnel and hands back a raw socket to the target.
function openTunnel(proxy, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error('Proxy connection timed out')));
    socket.on('error', (err) => fail(new Error(`Proxy connection failed: ${err.message}`)));

    socket.on('connect', () => {
      socket.write(
        [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          `Proxy-Authorization: ${proxyAuthHeader(proxy)}`,
          'Proxy-Connection: keep-alive',
          '',
          '',
        ].join('\r\n')
      );
    });

    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('latin1');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        // A well-behaved proxy answers in one small packet; anything this
        // large means it isn't speaking CONNECT at all.
        if (buffer.length > 8192) fail(new Error('Proxy sent an oversized CONNECT response'));
        return;
      }

      socket.removeListener('data', onData);
      const statusLine = buffer.slice(0, buffer.indexOf('\r\n'));
      const status = Number((statusLine.match(/^HTTP\/\d\.\d (\d{3})/) || [])[1]);

      if (status !== 200) {
        // 407 here is the proxy rejecting the credentials, which is worth
        // distinguishing from the target site blocking us.
        fail(new Error(status === 407 ? 'Proxy rejected the credentials (407)' : `Proxy refused CONNECT: ${statusLine.trim()}`));
        return;
      }

      settled = true;
      socket.setTimeout(0);
      resolve(socket);
    };

    socket.on('data', onData);
  });
}

function readHttpResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;

    const finish = (err, value) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve(value);
    };

    const timer = setTimeout(() => finish(new Error('Timed out reading the response')), timeoutMs);

    socket.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        clearTimeout(timer);
        // Truncation is fine: the extractor only needs the top of the page,
        // and an unbounded read is a memory risk on a small instance.
        chunks.push(chunk);
        finish(null, Buffer.concat(chunks));
        return;
      }
      chunks.push(chunk);
    });
    socket.on('end', () => {
      clearTimeout(timer);
      finish(null, Buffer.concat(chunks));
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      finish(err);
    });
  });
}

function parseHttpMessage(raw) {
  const text = raw.toString('latin1');
  const headerEnd = text.indexOf('\r\n\r\n');
  if (headerEnd === -1) return { status: 0, headers: {}, body: '' };

  const head = text.slice(0, headerEnd);
  const [statusLine, ...headerLines] = head.split('\r\n');
  const status = Number((statusLine.match(/^HTTP\/\d\.\d (\d{3})/) || [])[1]) || 0;

  const headers = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  let body = raw.slice(headerEnd + 4);

  // Chunked bodies have to be reassembled by hand — there's no http module
  // doing it for us inside the tunnel.
  if ((headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
    body = dechunk(body);
  }

  // Encoding is requested as identity below, so the body should be plain
  // text; anything else is decoded as UTF-8 and left to the caller.
  return { status, headers, body: body.toString('utf8') };
}

function dechunk(buffer) {
  const out = [];
  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd === -1) break;
    const size = parseInt(buffer.slice(offset, lineEnd).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = lineEnd + 2;
    out.push(buffer.slice(start, start + size));
    offset = start + size + 2;
  }
  return Buffer.concat(out);
}

// Fetches one URL through one proxy. Redirects are followed inside the same
// proxy session, so a redirect doesn't silently fall back to a direct
// connection and leak the origin's own IP.
async function fetchThroughProxy(url, proxy, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Only https:// targets are supported through the proxy');

  const port = Number(target.port) || 443;
  const tunnel = await openTunnel(proxy, target.hostname, port, timeoutMs);

  const secured = await new Promise((resolve, reject) => {
    const socket = tls.connect({ socket: tunnel, servername: target.hostname }, () => resolve(socket));
    socket.on('error', (err) => reject(new Error(`TLS through proxy failed: ${err.message}`)));
  });

  const requestHeaders = {
    Host: target.host,
    // identity: nothing here decompresses gzip, and asking for it would turn
    // every page into bytes the extractor can't read.
    'Accept-Encoding': 'identity',
    Connection: 'close',
    ...headers,
  };

  secured.write(
    [
      `GET ${target.pathname}${target.search} HTTP/1.1`,
      ...Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ].join('\r\n')
  );

  const raw = await readHttpResponse(secured, timeoutMs);
  const response = parseHttpMessage(raw);

  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location && redirectsLeft > 0) {
    const next = new URL(response.headers.location, url).toString();
    return fetchThroughProxy(next, proxy, { headers, timeoutMs, redirectsLeft: redirectsLeft - 1 });
  }

  return { ...response, finalUrl: url };
}

module.exports = { parseProxies, describeProxy, fetchThroughProxy };
