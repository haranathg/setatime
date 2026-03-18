const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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
    const { mainTask, mainTime } = body;

    if (!mainTask || !mainTime) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'mainTask and mainTime are required' }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' }),
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
