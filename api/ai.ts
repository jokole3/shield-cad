export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'На сервере не задана переменная GROQ_API_KEY (Vercel → Settings → Environment Variables).',
    });
  }

  try {
    const { prompt, systemPrompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Пустой запрос' });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
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
      return res.status(groqRes.status).json({
        error: `Ошибка Groq API (${groqRes.status}): ${errText.slice(0, 200)}`,
      });
    }

    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Внутренняя ошибка сервера' });
  }
}
