export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Задайте GROQ_API_KEY в Environment variables на Netlify.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  try {
    const { prompt, systemPrompt } = await req.json();
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt || 'Respond in valid JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return new Response(
        JSON.stringify({ error: `Groq API (${groqRes.status}): ${errText.slice(0, 200)}` }),
        { status: groqRes.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Ошибка сервера' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
