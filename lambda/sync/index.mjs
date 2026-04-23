import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

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

    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'action must be "load" or "save"' }) };
  } catch (error) {
    console.error('Sync Lambda error:', error);
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
