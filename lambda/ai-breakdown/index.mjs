import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// The branches a garden starts with, used when a client sends no layout.
const DEFAULT_GARDEN_BRANCHES = [
  'Health',
  'Career Exploration',
  'School',
  'Relationships',
  'Emotional Maturity',
  'Environment & Lifestyle',
  'Purpose & Meaning',
];

// Common AI drift for the default branch names, keyed by the normalized form
// (lowercase, letters and digits only). Applied only when the target is
// still one of the user's branches.
const GARDEN_ALIASES = {
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

    // Garden action categorization mode. Files a positive-action log entry
    // under one of the user's branches. The branches and goals are the
    // user's own (set in the app's Arrange editor) and arrive with each
    // request; the seven defaults apply when a client sends none.
    //
    // A goal ("Learn to cook") wins over its branch whenever the entry
    // advances it. Otherwise the entry gets a branch plus a free-form
    // sub-category, reusing an existing sub when one fits, so the tree keeps
    // growing new sub-branches organically. Recent corrections the user made
    // by hand are passed as examples of how they like things sorted.
    if (body.mode === 'categorize-action') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
      if (!text) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'text is required' }) };
      }
      const str = (v, len) => (typeof v === 'string' ? v.trim().slice(0, len) : '');

      let branches = Array.isArray(body.branches)
        ? [...new Set(body.branches.map((v) => str(v, 40)).filter(Boolean))].slice(0, 12)
        : [];
      if (branches.length === 0) branches = DEFAULT_GARDEN_BRANCHES;
      branches = branches.filter((n) => n.toLowerCase() !== 'other');
      const allBranches = [...branches, 'Other'];

      const goals = (Array.isArray(body.goals) ? body.goals : [])
        .map((g) => ({
          id: str(g?.id, 64),
          name: str(g?.name, 40),
          description: str(g?.description, 160),
          branch: str(g?.branch, 40),
        }))
        .filter((g) => g.id && g.name && branches.includes(g.branch))
        .slice(0, 40);

      const examples = (Array.isArray(body.examples) ? body.examples : [])
        .map((x) => ({ text: str(x?.text, 160), primary: str(x?.primary, 40), sub: str(x?.sub, 40) }))
        .filter((x) => x.text && allBranches.includes(x.primary))
        .slice(-15);

      const subsByPrimary = new Map();
      if (Array.isArray(body.existingCategories)) {
        for (const c of body.existingCategories) {
          const primary = str(c?.primary, 40);
          if (!primary) continue;
          const subs = Array.isArray(c.subs) ? c.subs.map((v) => str(v, 40)).filter(Boolean).slice(0, 30) : [];
          subsByPrimary.set(primary, subs);
        }
      }
      const branchList = allBranches
        .map((name) => {
          const subs = subsByPrimary.get(name) || [];
          return `- ${name}${subs.length ? ` — existing subs: ${subs.join(', ')}` : ''}`;
        })
        .join('\n');
      const goalList = goals.length
        ? goals.map((g) => `- id "${g.id}": ${g.name} (branch: ${g.branch})${g.description ? ` — ${g.description}` : ''}`).join('\n')
        : '(none)';
      const exampleList = examples.length
        ? examples.map((x) => `- "${x.text}" → ${x.primary}${x.sub ? ` · ${x.sub}` : ''}`).join('\n')
        : '(none yet)';

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

The user's GOALS (things they are deliberately working on):
${goalList}

The user's BRANCHES (top-level areas of their life):
${branchList}

How this user has sorted entries before, when they corrected the AI — follow their style:
${exampleList}

Return ONLY valid JSON in this exact format, no other text:
{"goal": "<goal id or null>", "primary": "<branch name>", "sub": "<sub-category>"}

Rules:
- If the action clearly advances one of the goals, set "goal" to that goal's id. Cooking a meal advances a "learn to cook" goal even though it is also healthy.
- Otherwise set "goal" to null, pick EXACTLY ONE branch name from the list (verbatim), and give a short sub-category (1-3 words, Title Case).
- Use "Other" only when no branch fits.
- Prefer an existing sub listed next to the branch when one fits; invent a new one only when nothing applies.
- Map synonyms to the same sub: "brushed teeth" and "flossed" are both Dental.`,
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
      // Adaptive thinking may put a thinking block first; find the text block.
      const textBlock = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;
      const content = textBlock && typeof textBlock.text === 'string' ? textBlock.text : '';
      if (!content) {
        console.error('AI response had no text block');
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
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }

      const goal = typeof parsed.goal === 'string' ? goals.find((g) => g.id === parsed.goal) : undefined;
      if (goal) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ primary: goal.branch, sub: goal.name, goalId: goal.id }),
        };
      }

      const rawPrimary = str(parsed.primary, 60);
      const sub = str(parsed.sub, 40);
      if (!rawPrimary) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI did not return a primary category' }) };
      }
      // Snap a drifted primary ("Career", "career exploration") back to one
      // of the user's branch names. An alias only applies if its target is
      // still one of their branches; anything unmatched lands in Other
      // rather than inventing a new branch.
      const normalize = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const byNorm = new Map(allBranches.map((d) => [normalize(d), d]));
      const alias = GARDEN_ALIASES[normalize(rawPrimary)];
      const primary = byNorm.get(normalize(rawPrimary)) || (alias && allBranches.includes(alias) ? alias : 'Other');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ primary, sub: sub || undefined }),
      };
    }

    // Garden "thirsty branch" nudge: one tiny, concrete action in the branch
    // the user has logged least this week. If that branch has goals, the
    // suggestion should advance one of them. Small enough to do in two
    // minutes, so the nudge turns imbalance into a next step, not guilt.
    if (body.mode === 'suggest-micro-action') {
      const str = (v, len) => (typeof v === 'string' ? v.trim().slice(0, len) : '');
      const domain = str(body.domain, 40);
      if (!domain || domain.toLowerCase() === 'other') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain must be one of the user\'s branches' }) };
      }
      const cleanList = (v, max, len) =>
        (Array.isArray(v) ? v : [])
          .map((s) => str(s, len))
          .filter(Boolean)
          .slice(0, max);
      const subs = cleanList(body.subs, 20, 40);
      const recent = cleanList(body.recent, 8, 120);
      const avoid = cleanList(body.avoid, 6, 120);
      const goals = (Array.isArray(body.goals) ? body.goals : [])
        .map((g) => ({ id: str(g?.id, 64), name: str(g?.name, 40), description: str(g?.description, 160) }))
        .filter((g) => g.id && g.name)
        .slice(0, 6);
      const goalLine = goals.length
        ? `Their goals in ${domain} — prefer an action that advances one of these:\n${goals.map((g) => `- id "${g.id}": ${g.name}${g.description ? ` — ${g.description}` : ''}`).join('\n')}`
        : `They have no specific goals set in ${domain}.`;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-5-5',
          max_tokens: 1024,
          output_config: { effort: 'low' },
          fallbacks: 'default',
          messages: [
            {
              role: 'user',
              content: `The user keeps a "garden" log of small positive actions, grouped into branches of their life. This week they have logged least in: ${domain}.

Suggest ONE tiny positive action for that branch that they could do in about two minutes, right now, wherever they are. It should be concrete and physically startable (not "think about your career" but "skim one job posting in a field you're curious about"). The user is a student.

${goalLine}

Sub-categories they already use in ${domain}: ${subs.length ? subs.join(', ') : '(none yet)'}
Recent ${domain} actions they logged: ${recent.length ? recent.map((r) => `"${r}"`).join('; ') : '(none yet)'}
Do not repeat these earlier suggestions: ${avoid.length ? avoid.map((r) => `"${r}"`).join('; ') : '(none)'}

Return ONLY valid JSON, no other text:
{"action": "<imperative, under 12 words, no trailing period>", "goal": "<id of the goal it advances, or null>", "sub": "<sub-category, 1-3 words, Title Case>"}

For "sub", reuse one of their existing sub-categories when it fits; otherwise name a new one.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Anthropic API error:', response.status, err.slice(0, 500));
        return { statusCode: 502, headers, body: JSON.stringify({ error: `AI service error (${response.status})` }) };
      }

      const data = await response.json();
      if (data.stop_reason === 'refusal') {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI declined to suggest an action' }) };
      }
      const textBlock = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;
      const content = textBlock && typeof textBlock.text === 'string' ? textBlock.text : '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Could not parse JSON from AI response:', content.slice(0, 300));
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }
      const action = str(parsed.action, 120).replace(/\.$/, '');
      const sub = str(parsed.sub, 40);
      const goal = typeof parsed.goal === 'string' ? goals.find((g) => g.id === parsed.goal) : undefined;
      if (!action) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI did not return an action' }) };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ action, sub: sub || undefined, goalId: goal ? goal.id : undefined }),
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
