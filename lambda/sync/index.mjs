import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';

const s3 = new S3Client({ region: 'us-west-2' });
const BUCKET = 'setatime-userdata-us-west-2';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const icalHeaders = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Content-Disposition': 'attachment; filename="setatime.ics"',
};

function hashKey(secretKey) {
  return createHash('sha256').update(secretKey).digest('hex');
}

function pad2(n) {
  return n.toString().padStart(2, '0');
}

function toICalDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [h, min] = timeStr.split(':');
  return `${y}${m}${d}T${h}${min}00`;
}

function escapeICalText(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function blocksToICS(blocks) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SetATime//SetATime Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SetATime',
  ];

  for (const block of blocks) {
    // In SetATime, mainTime is the "be ready by" deadline. Sub-tasks are
    // prep steps BEFORE it. Event spans earliest sub-task → mainTime + buffer.
    let startDate = block.date;
    let startTime = block.mainTime;

    const subs = block.subTasks || [];
    const sameDaySubs = subs.filter((s) => !s.date || s.date === block.date);

    for (const sub of sameDaySubs) {
      const [sh, sm] = sub.time.split(':').map(Number);
      const [mh, mm] = startTime.split(':').map(Number);
      if (sh * 60 + sm < mh * 60 + mm) {
        startTime = sub.time;
      }
    }

    // End = mainTime + 15 min buffer
    const [eh, em] = block.mainTime.split(':').map(Number);
    const endTotalMin = eh * 60 + em + 15;
    const endTime = `${pad2(Math.floor(endTotalMin / 60) % 24)}:${pad2(endTotalMin % 60)}`;
    const endDate = block.date;

    // No sub-tasks: 1-hour event ending at mainTime + 15min
    if (subs.length === 0) {
      const startTotalMin = eh * 60 + em - 60;
      const sh2 = Math.floor(((startTotalMin % 1440) + 1440) % 1440 / 60);
      const sm2 = ((startTotalMin % 60) + 60) % 60;
      startTime = `${pad2(sh2)}:${pad2(sm2)}`;
    }

    const descParts = [];
    for (const sub of subs) {
      const check = sub.completed ? '[x]' : '[ ]';
      descParts.push(`${check} ${sub.time} ${sub.label}`);
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}T${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}Z`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${block.id}@setatime`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toICalDate(startDate, startTime)}`);
    lines.push(`DTEND:${toICalDate(endDate, endTime)}`);
    lines.push(`SUMMARY:${escapeICalText(block.mainTask)}`);
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeICalText(descParts.join('\n'))}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}


// ---------------------------------------------------------------------------
// Calendar feed fetching
//
// Browsers cannot fetch a school or Outlook .ics feed directly: those servers
// send no CORS headers, so the request never leaves the page. Fetching it here
// is the only way SetATime can stay current without the user re-exporting
// files by hand.
//
// A server that fetches a URL on request is also a classic SSRF hole, so this
// is deliberately narrow: https only, public addresses only, redirects
// re-checked rather than followed blindly, hard size and time caps, and the
// URL is never logged — a calendar feed URL is an unauthenticated credential,
// and CloudWatch keeps whatever is printed to it.

const FETCH_TIMEOUT_MS = 8000;
const MAX_ICS_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class FeedError extends Error {}

/** Addresses that must never be reachable from here. The metadata service on
 *  169.254.169.254 is the one that actually matters — it hands out this
 *  function's own IAM credentials to anything that can make it issue a GET. */
export function isPrivateAddress(ip) {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  if (ip.includes(':')) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    const head = parseInt(low.split(':')[0] || '0', 16);
    if ((head & 0xfe00) === 0xfc00) return true;   // fc00::/7  unique-local
    if ((head & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
    return false;
  }

  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                 // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;       // CGNAT
  if (a >= 224) return true;                               // multicast / reserved
  return false;
}

/** Validate a feed URL and prove every address it resolves to is public. */
export async function assertFetchableUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    throw new FeedError('That does not look like a calendar URL.');
  }
  let url;
  try {
    // Calendar apps hand out webcal:// links; they are https underneath.
    url = new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    throw new FeedError('That does not look like a calendar URL.');
  }
  if (url.protocol !== 'https:') {
    throw new FeedError('Only https calendar feeds can be used.');
  }
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new FeedError('That calendar host could not be found.');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FeedError('That calendar host is not reachable.');
  }
  return url;
}

/** Fetch an .ics feed, re-validating the destination at every redirect so a
 *  public URL cannot bounce us onto an internal one. */
async function fetchFeed(rawUrl) {
  let url = await assertFetchableUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: control.signal,
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
      });
    } catch {
      // Deliberately not surfacing the underlying error: it embeds the URL.
      throw new FeedError('Could not reach that calendar feed.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new FeedError('That calendar feed redirected nowhere.');
      url = await assertFetchableUrl(new URL(location, url).toString());
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new FeedError('That calendar feed refused the request — the URL may have been reset.');
    }
    if (!response.ok) {
      throw new FeedError(`That calendar feed returned ${response.status}.`);
    }

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_ICS_BYTES) throw new FeedError('That calendar is too large to fetch.');

    const text = await response.text();
    if (text.length > MAX_ICS_BYTES) throw new FeedError('That calendar is too large to fetch.');
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new FeedError('That URL did not return a calendar.');
    }
    return text;
  }

  throw new FeedError('That calendar feed redirected too many times.');
}

/**
 * Who may use the fetcher.
 *
 * ALLOWED_KEY_HASHES is the real gate when it is configured. Without it the
 * fallback is that the key must already own data in the bucket, which a
 * four-character guess does not. Either way this is never an open relay that
 * anyone who finds the endpoint can point at any address.
 */
async function mayFetchFeeds(secretKey, fileKey) {
  const allowed = (process.env.ALLOWED_KEY_HASHES || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0) return allowed.includes(hashKey(secretKey).toLowerCase());

  try {
    await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
    return true;
  } catch {
    return false;
  }
}

async function loadUserData(fileKey) {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
    const content = await result.Body.transformToString();
    return JSON.parse(content);
  } catch (err) {
    if (err.name === 'NoSuchKey') return { blocks: [] };
    throw err;
  }
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || '';

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: jsonHeaders, body: '' };
  }

  try {
    // GET requests: iCal feed. Expects ?key=<secretKey> query param.
    if (method === 'GET') {
      const secretKey = event.queryStringParameters?.key;
      if (!secretKey || secretKey.length < 4) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ error: 'key query parameter required (min 4 chars)' }),
        };
      }

      const fileKey = `${hashKey(secretKey)}.json`;
      const data = await loadUserData(fileKey);
      const ics = blocksToICS(data.blocks || []);

      return { statusCode: 200, headers: icalHeaders, body: ics };
    }

    // POST requests: existing load/save JSON API
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { action, secretKey, data } = body;

    if (!secretKey || typeof secretKey !== 'string' || secretKey.length < 4) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Secret key must be at least 4 characters' }),
      };
    }

    const fileKey = `${hashKey(secretKey)}.json`;

    if (action === 'load') {
      const userData = await loadUserData(fileKey);
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify(userData) };
    }

    if (action === 'save') {
      if (!data) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'data is required' }) };
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: fileKey,
          Body: JSON.stringify(data),
          ContentType: 'application/json',
        })
      );
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'fetchCalendars') {
      if (!(await mayFetchFeeds(secretKey, fileKey))) {
        return {
          statusCode: 403,
          headers: jsonHeaders,
          body: JSON.stringify({ error: 'Not allowed to fetch calendar feeds with this key.' }),
        };
      }
      const urls = Array.isArray(body.urls) ? body.urls.slice(0, 10) : [];
      if (urls.length === 0) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'urls is required' }) };
      }
      // One result per URL, in order, each either text or a reason. A feed
      // that has gone stale must not take the others down with it.
      const results = [];
      for (const u of urls) {
        try {
          results.push({ ok: true, ics: await fetchFeed(u) });
        } catch (err) {
          results.push({ ok: false, error: err instanceof FeedError ? err.message : 'Could not fetch that feed.' });
        }
      }
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ results }) };
    }

    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'action must be "load", "save" or "fetchCalendars"' }) };
  } catch (error) {
    // Never log the error object itself: a failed fetch embeds the feed URL,
    // and a calendar feed URL is an unauthenticated credential.
    console.error('Sync Lambda error:', error && error.name ? error.name : 'unknown');
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
