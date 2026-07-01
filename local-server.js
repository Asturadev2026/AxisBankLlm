// LOCAL DEV ONLY — not used by Vercel. Serves the static files and emulates /api/chat.
// Run:  $env:OPENAI_API_KEY="sk-..."; node local-server.js
// Then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildGrounding, credentialRefusal } = require('./axis-knowledge.js');

const PORT = process.env.PORT || 5050;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

async function handleChat(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'missing-api-key' }));
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    let messages = [];
    try { messages = (JSON.parse(raw || '{}').messages) || []; } catch {}
    const userMsgs = messages.filter((m) => m.role === 'user');
    const lastUser = userMsgs[userMsgs.length - 1];
    const refusal = credentialRefusal(lastUser ? lastUser.content : '');
    if (refusal) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: refusal }));
    }
    const retrievalQuery = userMsgs.slice(-2).map((m) => m.content).join(' ');
    const grounded = [{ role: 'system', content: buildGrounding(retrievalQuery) }, ...messages];
    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o', messages: grounded, temperature: 0.5, max_tokens: 1400 }),
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'openai-error', detail }));
      }
      const data = await upstream.json();
      const text = data?.choices?.[0]?.message?.content || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'request-failed', detail: String(err) }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);

  let rel = req.url.split('?')[0];
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Running at http://localhost:${PORT}  (Ctrl+C to stop)`));
