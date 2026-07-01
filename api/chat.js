// Vercel serverless function: /api/chat
// Receives { messages } from the front-end and forwards to OpenAI.
// The API key is read from the OPENAI_API_KEY environment variable (set it in
// Vercel: Project -> Settings -> Environment Variables). It never reaches the browser.

import { buildGrounding, credentialRefusal } from '../axis-knowledge.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'missing-api-key' });
  }

  // Vercel parses JSON bodies automatically; fall back to manual parse just in case.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const messages = (body && body.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'no-messages' });
  }

  // Hard refuse credential-sharing requests before spending an LLM call.
  const userMsgs = messages.filter((m) => m.role === 'user');
  const lastUser = userMsgs[userMsgs.length - 1];
  const refusal = credentialRefusal(lastUser ? lastUser.content : '');
  if (refusal) return res.status(200).json({ text: refusal });

  // Retrieve using the last two user turns so short follow-ups keep their context.
  const retrievalQuery = userMsgs.slice(-2).map((m) => m.content).join(' ');
  const grounded = [{ role: 'system', content: buildGrounding(retrievalQuery) }, ...messages];

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',        // stronger model for detailed answers (change if you like)
        messages: grounded,     // grounding + app's [{system}, ...history, {user}]
        temperature: 0.5,
        max_tokens: 1400,       // allow long, thorough answers
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(502).json({ error: 'openai-error', detail });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'request-failed', detail: String(err) });
  }
}
