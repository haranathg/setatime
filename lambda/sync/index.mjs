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
    let endDate = block.date;
    let endTime = block.mainTime;

    if (block.subTasks && block.subTasks.length > 0) {
      let latestMinutes = 0;
      for (const sub of block.subTasks) {
        const [sh, sm] = sub.time.split(':').map(Number);
        const mins = sh * 60 + sm;
        if (mins > latestMinutes) {
          latestMinutes = mins;
          endDate = sub.date || block.date;
          endTime = sub.time;
        }
      }
      // Add 15 min buffer after last sub-task
      const [eh, em] = endTime.split(':').map(Number);
      const totalMin = eh * 60 + em + 15;
      const nh = Math.floor(totalMin / 60) % 24;
      const nm = totalMin % 60;
      endTime = `${pad2(nh)}:${pad2(nm)}`;
    } else {
      // Default: 1 hour duration
      const [h, m] = block.mainTime.split(':').map(Number);
      const totalMin = h * 60 + m + 60;
      const nh = Math.floor(totalMin / 60) % 24;
      const nm = totalMin % 60;
      endTime = `${pad2(nh)}:${pad2(nm)}`;
    }

    const descParts = [];
    if (block.subTasks) {
      for (const sub of block.subTasks) {
        const check = sub.completed ? '[x]' : '[ ]';
        descParts.push(`${check} ${sub.time} ${sub.label}`);
      }
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}T${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}Z`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${block.id}@setatime`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toICalDate(block.date, block.mainTime)}`);
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
