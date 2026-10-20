const $ = id => document.getElementById(id);
const fab = $('fab'), panel = $('panel'), rec = $('rec'), log = $('log'), statusEl = $('status');
let recorder, chunks = [], stream, busy = false, history = [], audio;

function setPanel(open) {
  panel.hidden = !open;
  fab.setAttribute('aria-expanded', open);
  if (open) rec.focus();
}
fab.onclick = () => setPanel(panel.hidden);
$('close').onclick = () => { setPanel(false); fab.focus(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) setPanel(false); });

const setStatus = t => statusEl.textContent = t;
function addMsg(text, who) {
  const p = document.createElement('p');
  p.className = `urdu ${who === 'user' ? 'msg-user' : 'msg-bot'}`;
  p.dir = 'rtl'; p.lang = 'ur'; p.textContent = text;
  log.appendChild(p); log.scrollTop = log.scrollHeight;
}
function addError(text) {
  const p = document.createElement('p');
  p.className = 'text-sm text-red-700'; p.textContent = text;
  log.appendChild(p); log.scrollTop = log.scrollHeight;
}
async function api(path, options) {
  const r = await fetch(path, options);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Request failed (${r.status})`); }
  return r;
}

rec.onclick = async () => {
  if (busy) return;
  if (recorder && recorder.state === 'recording') return recorder.stop();
  if (!navigator.mediaDevices || !window.MediaRecorder) return addError('This browser cannot record audio. Try Chrome or Safari 14.1+.');
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return addError('Microphone blocked. Allow microphone access in the browser address bar and try again.'); }
  if (audio) audio.pause();
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); handle(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
  recorder.start();
  rec.classList.add('recording'); rec.textContent = 'Stop and send'; setStatus('Listening…');
};

async function handle(blob) {
  busy = true; rec.classList.remove('recording'); rec.textContent = 'Record question'; rec.disabled = true;
  try {
    if (blob.size < 1500) throw new Error('Recording was too short. Hold on a little longer.');
    setStatus('Understanding…');
    const { text } = await (await api('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })).json();
    if (!text) throw new Error('Could not hear anything. Please try again.');
    addMsg(text, 'user'); history.push({ role: 'user', content: text });
    setStatus('Thinking…');
    const { reply } = await (await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history }) })).json();
    history.push({ role: 'assistant', content: reply }); addMsg(reply, 'bot');
    setStatus('Speaking…'); await say(reply);
  } catch (e) { addError(e.message); }
  busy = false; rec.disabled = false; setStatus('Ready');
}

async function say(text) {
  try {
    const blob = await (await api('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).blob();
    audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
    await new Promise(res => { audio.onended = res; audio.onerror = res; });
  } catch {
    // ElevenLabs unavailable: fall back to the browser voice so the demo still talks
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ur-PK';
      speechSynthesis.speak(u);
    }
  }
}
