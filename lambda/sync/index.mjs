import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

const s3 = new S3Client({ region: 'us-west-2' });
const BUCKET = 'setatime-userdata-us-west-2';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function hashKey(secretKey) {
  return createHash('sha256').update(secretKey).digest('hex');
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { action, secretKey, data } = body;

    if (!secretKey || typeof secretKey !== 'string' || secretKey.length < 4) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Secret key must be at least 4 characters' }),
      };
    }

    const fileKey = `${hashKey(secretKey)}.json`;

    if (action === 'load') {
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
        const content = await result.Body.transformToString();
        return { statusCode: 200, headers, body: content };
      } catch (err) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 200, headers, body: JSON.stringify({ blocks: [] }) };
        }
        throw err;
      }
    }

    if (action === 'save') {
      if (!data) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'data is required' }) };
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: fileKey,
          Body: JSON.stringify(data),
          ContentType: 'application/json',
        })
      );
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action must be "load" or "save"' }) };
  } catch (error) {
    console.error('Sync Lambda error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
