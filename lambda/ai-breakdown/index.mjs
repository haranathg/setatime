import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// The Anthropic key lives in Secrets Manager; only setatime-lambda-role can
// read it. The AWS SDK ships with the nodejs22.x runtime, so this file stays
// dependency-free. Never log the key or the raw secret response.
const ANTHROPIC_SECRET_ID = process.env.ANTHROPIC_SECRET_ID || 'setatime/anthropic-api-key';
const secretsClient = new SecretsManagerClient({});
let cachedApiKey = null; // fetched once per cold start

async function getAnthropicApiKey() {
  if (cachedApiKey) return cachedApiKey;
  try {
    const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: ANTHROPIC_SECRET_ID }));
    const value = res.SecretString?.trim();
    if (value) {
      cachedApiKey = value;
      return cachedApiKey;
    }
    console.error('Anthropic secret is empty');
  } catch (err) {
    console.error('Could not read Anthropic secret:', err.name);
  }
  return null;
}

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

    // Auth check: verify the caller has a valid secret key hash
    const allowedHashes = (process.env.ALLOWED_KEY_HASHES || '').split(',').filter(Boolean);
    if (allowedHashes.length > 0) {
      const authHash = body.authHash;
      if (!authHash || !allowedHashes.includes(authHash)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Unauthorized. Please connect with your sync key first.' }),
        };
      }
    }

    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }

    // Brain dump extraction mode
    if (body.mode === 'brain-dump-extract') {
      const { text } = body;
      if (!text) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'text is required' }) };
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `You are a task extraction assistant. The user has written a brain dump of things they need to do.

Extract individual, actionable tasks from this text. Each task should be a clear, concise label.

Return ONLY valid JSON in this exact format, no other text:
[{"label": "task description"}, ...]

Rules:
- Extract 1-20 tasks
- Each label should be short (under 60 chars)
- Ignore filler words and feelings, focus on actionable items
- If the user mentions specific times, include them in the label
- Keep the user's intent — don't reinterpret or over-summarize

Brain dump text:
${text}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic API error:', err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI service error' }) };
      }

      const data = await response.json();
      const content = data.content[0].text;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }

      const tasks = JSON.parse(jsonMatch[0]);
      return { statusCode: 200, headers, body: JSON.stringify({ tasks }) };
    }

    // Habit activation mode: turn a habit into the smallest possible first
    // physical action, plus even-smaller fallbacks for the worst days.
    if (body.mode === 'habit-activation') {
      const { name, reason } = body;
      if (!name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: `You design "activation steps" for someone with executive dysfunction. They want the habit: "${name}".${
                reason ? ` Their reason: "${reason}".` : ''
              }

The goal is behavioral activation: get the body moving with the smallest possible physical action, so momentum — not motivation — does the work. The person is often stuck, ruminating, and cannot decompose tasks in the moment. You decompose for them.

Return ONLY valid JSON in this exact format, no other text:
{"activationStep": "...", "microSteps": ["...", "..."]}

Rules for activationStep:
- A single concrete PHYSICAL action, something the body does in under ~60 seconds
- So small it feels almost silly to refuse ("put on your running shoes", not "go for a run")
- Imperative voice, second person, no outcome or duration, no "and"
- Under 8 words

Rules for microSteps:
- 3 items, each EVEN SMALLER than the activation step, tiniest first
- The first should be doable from bed/couch without standing if possible
- Same imperative, physical, under 8 words, no "and"
- These are the "I can't even do that" fallbacks`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic API error:', err);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI service error' }) };
      }

      const data = await response.json();
      const content = data.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          activationStep: parsed.activationStep || '',
          microSteps: Array.isArray(parsed.microSteps) ? parsed.microSteps : [],
        }),
      };
    }

    // Garden action categorization mode: take a positive-action log entry
    // and slot it into one of the user's seven life domains (plus an
    // Other overflow) + a free-form sub-category inside that domain.
    //
    // The top level is deliberately fixed so the tree has a stable shape
    // and the imbalance signal is legible — a sparse branch is a
    // neglected domain. Sub-categories keep emerging organically so the
    // tree grows more complex the more you log: "fixed my TMJ exercise"
    // becomes Health · Fixing TMJ the first time and reuses that sub on
    // every subsequent TMJ entry.
    if (body.mode === 'categorize-action') {
      const { text, existingCategories } = body;
      if (!text) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'text is required' }) };
      }

      // existingCategories comes keyed by primary → [sub names]. Format
      // it into a per-domain hint list so the AI prefers subs you've
      // already named.
      const subsByPrimary = new Map();
      if (Array.isArray(existingCategories)) {
        for (const c of existingCategories) {
          if (!c || typeof c.primary !== 'string') continue;
          const subs = Array.isArray(c.subs) ? c.subs.filter((s) => typeof s === 'string' && s) : [];
          subsByPrimary.set(c.primary, subs);
        }
      }
      const subHintLine = (name) => {
        const subs = subsByPrimary.get(name) || [];
        return subs.length > 0 ? ` — existing subs: ${subs.join(', ')}` : '';
      };

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-5-5',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `Categorize this positive action the user took.

User's action: "${text}"

TOP-LEVEL DOMAINS (pick EXACTLY ONE, use the name verbatim):
- Health${subHintLine('Health')}
- Career Exploration${subHintLine('Career Exploration')}
- School${subHintLine('School')}
- Relationships${subHintLine('Relationships')}
- Emotional Maturity${subHintLine('Emotional Maturity')}
- Environment & Lifestyle${subHintLine('Environment & Lifestyle')}
- Purpose & Meaning${subHintLine('Purpose & Meaning')}
- Other${subHintLine('Other')}

Return ONLY valid JSON in this exact format, no other text:
{"primary": "<one of the domains above>", "sub": "<a specific sub-category>"}

Rules:
- "primary" MUST be one of the eight names above, spelled exactly (including ampersands and capitalization).
- Use "Other" only when nothing else fits — strongly prefer one of the seven real domains.
- "sub" is required: a short noun-phrase sub-category inside the chosen domain (1-3 words, Title Case).
- Strongly prefer an existing sub listed next to the domain when one fits. Invent a new sub only when nothing on the list applies.
- Keep subs honest and specific but not verbose. Examples: "Dental", "GERD", "Fixing TMJ", "Strength", "Family Call", "Side Project", "Therapy", "Journaling", "Deep Clean".
- Map common synonyms to the same sub: "brushed teeth" and "flossed" both go to Health · Dental; "called mom" and "called dad" both go to Relationships · Family Call.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic API error:', response.status, err);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({ error: `AI service error (${response.status}): ${err.slice(0, 500)}` }),
        };
      }

      const data = await response.json();
      // Adaptive thinking (default on current models) may emit a leading
      // `thinking` content block before the text. Find the text block
      // rather than assume index 0 — indexing wrongly made the whole
      // response look like "undefined" and the regex below never matched.
      const textBlock = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;
      const content = textBlock && typeof textBlock.text === 'string' ? textBlock.text : '';
      if (!content) {
        console.error('AI response had no text block:', JSON.stringify(data).slice(0, 1000));
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI response had no text block' }) };
      }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Could not parse JSON from AI response:', content.slice(0, 500));
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({ error: `Could not parse AI response: ${content.slice(0, 200)}` }),
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const rawPrimary = typeof parsed.primary === 'string' ? parsed.primary.trim() : '';
      const sub = typeof parsed.sub === 'string' ? parsed.sub.trim() : '';
      if (!rawPrimary) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI did not return a primary category' }) };
      }
      // Snap drifted primaries ("Career" / "career exploration" / "Career &
      // Exploration") back to a canonical domain. If nothing matches, the
      // entry lands in "Other" rather than inventing a ninth branch.
      const CANONICAL_DOMAINS = [
        'Health',
        'Career Exploration',
        'School',
        'Relationships',
        'Emotional Maturity',
        'Environment & Lifestyle',
        'Purpose & Meaning',
        'Other',
      ];
      const normalize = (s) => s.toLowerCase().replace(/[^a-z]+/g, '');
      const canonicalByNorm = new Map(CANONICAL_DOMAINS.map((d) => [normalize(d), d]));
      // Alias table for common AI drift. Keyed by normalized form.
      const ALIASES = {
        career: 'Career Exploration',
        careers: 'Career Exploration',
        work: 'Career Exploration',
        job: 'Career Exploration',
        education: 'School',
        learning: 'School',
        study: 'School',
        academics: 'School',
        relationship: 'Relationships',
        family: 'Relationships',
        friends: 'Relationships',
        connection: 'Relationships',
        social: 'Relationships',
        emotions: 'Emotional Maturity',
        emotional: 'Emotional Maturity',
        mindfulness: 'Emotional Maturity',
        mentalhealth: 'Emotional Maturity',
        therapy: 'Emotional Maturity',
        environment: 'Environment & Lifestyle',
        lifestyle: 'Environment & Lifestyle',
        home: 'Environment & Lifestyle',
        finance: 'Environment & Lifestyle',
        meaning: 'Purpose & Meaning',
        purpose: 'Purpose & Meaning',
        spirituality: 'Purpose & Meaning',
        gratitude: 'Purpose & Meaning',
      };
      const norm = normalize(rawPrimary);
      const primary = canonicalByNorm.get(norm) || ALIASES[norm] || 'Other';
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ primary, sub: sub || undefined }),
      };
    }

    // Default mode: task breakdown
    const { mainTask, mainTime } = body;

    if (!mainTask || !mainTime) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'mainTask and mainTime are required' }),
      };
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a task planning assistant. The user wants to accomplish: "${mainTask}" at ${mainTime}.

Break this down into realistic prerequisite steps with specific times. Each step should have a realistic duration.

Return ONLY valid JSON in this exact format, no other text:
[{"time": "HH:MM", "label": "step description"}, ...]

Rules:
- All times must be before ${mainTime} in 24-hour format
- Keep to 3-7 steps
- Be realistic about how long each step takes
- Steps should be in chronological order`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'AI service error' }),
      };
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Could not parse AI response' }),
      };
    }

    const subTasks = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ subTasks }),
    };
  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
