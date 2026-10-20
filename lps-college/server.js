// Zero-dependency Node server (Node 18+). Serves /public and proxies API calls so keys stay in .env.
const http = require('http'), fs = require('fs'), path = require('path');
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { console.warn('No .env file found'); }
const E = process.env, PORT = E.PORT || 3000;

const SYSTEM = `You are the voice assistant of LPS College Dullewala. Always answer in Urdu (Urdu script), in 1 to 3 short, simple sentences, because your answer will be read aloud.
Use ONLY these facts:
- First year fee: 50,000 rupees.
- Second year fee: 60,000 rupees.
- Extra activities: sports gala, qawali night, football, and a vacation trip.
- Teachers: Ali, Hassan, Usman and Ahssan.
If asked anything else about the college (admissions, dates, subjects, address, phone), say politely that you do not have that information and suggest contacting the college office. Never invent facts. Write numbers in digits.`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  const parts = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 10e6) { no(new Error('too large')); req.destroy(); } else parts.push(c); });
  req.on('end', () => ok(Buffer.concat(parts))); req.on('error', no);
});

async function transcribe(req, res) {
  const buf = await readBody(req);
  const type = (req.headers['content-type'] || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), `voice.${ext}`);
  fd.append('model', E.GROQ_STT_MODEL || 'whisper-large-v3');
  if (E.STT_LANGUAGE) fd.append('language', E.STT_LANGUAGE);
  fd.append('prompt', 'پہلے سال کی فیس کتنی ہے؟ اساتذہ کے نام، کالج کی سرگرمیاں، دوسرے سال کی فیس۔');
  fd.append('temperature', '0');
  fd.append('response_format', 'json');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${E.GROQ_API_KEY}` }, body: fd });
  const d = await r.json();
  if (!r.ok) return json(res, r.status, { error: d.error?.message || 'Speech-to-text failed' });
  json(res, 200, { text: (d.text || '').trim() });
}

async function chat(req, res) {
  const { history = [] } = JSON.parse((await readBody(req)).toString() || '{}');
  const messages = [{ role: 'system', content: SYSTEM }, ...history.slice(-6)];
  // llama-3.3-70b-versatile was shut down by Groq (Aug 2026); gpt-oss models are the replacements
  const models = [E.GROQ_CHAT_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'].filter(Boolean);
  let lastError = 'Chat failed';
  for (const model of models) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${E.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_completion_tokens: 1500, reasoning_effort: 'low' })
    });
    const d = await r.json();
    if (r.ok) {
      const reply = (d.choices?.[0]?.message?.content || '').trim();
      if (reply) return json(res, 200, { reply });
      lastError = 'Empty reply from model';
    } else { lastError = d.error?.message || lastError; console.warn(`Model ${model} failed: ${lastError}`); }
  }
  json(res, 502, { error: lastError });
}

async function speak(req, res) {
  const { text } = JSON.parse((await readBody(req)).toString() || '{}');
  const voice = E.ELEVEN_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const call = model => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': E.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model })
  });
  let r = await call(E.ELEVEN_MODEL || 'eleven_v3');
  if (!r.ok) r = await call('eleven_multilingual_v2'); // fallback model
  if (!r.ok) return json(res, r.status, { error: 'Text-to-speech failed' });
  res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
  res.end(Buffer.from(await r.arrayBuffer()));
}

const routes = { '/api/transcribe': transcribe, '/api/chat': chat, '/api/speak': speak };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && routes[url.pathname]) return await routes[url.pathname](req, res);
    const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); json(res, 500, { error: 'Server error' }); }
}).listen(PORT, () => console.log(`LPS College site running at http://localhost:${PORT}`));
