# LPS College Dullewala: website with Urdu voice assistant

## Run
1. Install Node.js 18 or newer (https://nodejs.org).
2. Open a terminal in this folder and run:  node server.js   (or: npm start)
3. Open http://localhost:3000 in Chrome and allow the microphone.

No npm install needed. API keys live in .env and are only used by server.js, never sent to the browser.
Use http://localhost (or https when hosted); browsers block the microphone on plain http elsewhere.
Internet is needed for Tailwind CDN, Google Fonts, Groq and ElevenLabs.

## Flow
Mic -> /api/transcribe (Groq Whisper) -> /api/chat (Groq Llama) -> /api/speak (ElevenLabs) -> Urdu text + voice
