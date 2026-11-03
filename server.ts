import { heuristicAnalysis } from './cloudflare/heuristic.mjs';
import express from 'express';
import https from 'node:https';
import fs from 'node:fs';
import { createSecurity } from './security.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const security = createSecurity({ key: process.env.APP_ACCESS_KEY, production });
if (process.env.TRUST_LOOPBACK_PROXY === 'true') app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  if (production && !req.secure) return res.status(426).send('请通过 HTTPS 访问');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use('/api', security);

// Initialize Gemini client server-side
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Heuristic fallback generator when API key is missing or offline
// POST /api/agent/chat
app.post('/api/agent/chat', async (req, res) => {
  try {
    const { message, currentScene, currentTrack, weather, timeOfDay, userPreferences } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!ai || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      // Graceful fallback when GEMINI_API_KEY is not configured or placeholder
      const fallbackResult = heuristicAnalysis(message, currentScene);
      return res.json(fallbackResult);
    }

    const systemPrompt = `
You are the companion agent of "声屿 SoundIsle" (a music companion app).
Core Purpose:
1. Provide gentle, measured companion dialogue (适度对话提供陪伴). Keep your response to 1-2 thoughtful, empathetic, concise sentences in Chinese. Do NOT be verbose, pushy, or preachy.
2. Analyze the user's input, current state, weather (${weather || '阴天 20°C'}), and time of day (${timeOfDay || '深夜'}).
3. Map their mood and request to one of the 4 core scenes:
   - "focus": 深度专注 (coding, reading, studying, deep work, 60-70 BPM, Lo-Fi/Ambient/Piano)
   - "rest": 舒缓放空 (mindful rest, post-work unwind, tea time, acoustic/chill)
   - "workout": 晨曦跃动 (running, workout, brisk walk, 115-125 BPM rhythm)
   - "sleep": 夜泊星海 (sleep prep, wind-down, deep relaxation, soft binaural waves, 45-55 BPM)
4. If the user provides feedback or corrections ("纠正推荐", e.g., "更轻一点", "换纯钢琴", "不要鼓点", "太吵了"), immediately acknowledge and refine the scene parameters.
5. Return JSON matching the schema.
`;

    const geminiPromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `User message: "${message}". Current Scene: "${currentScene || 'focus'}", Current Track: "${currentTrack || 'Midnight Code Flow'}". User Preferences: ${JSON.stringify(userPreferences || {})}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: '1-2 concise, empathetic, companion sentences in Chinese.',
            },
            recommendedSceneId: {
              type: Type.STRING,
              description: 'One of: focus, rest, workout, sleep',
            },
            sceneTitle: {
              type: Type.STRING,
              description: 'A poetic, calm Chinese scene name like "夜窗微雨 · 深度专注"',
            },
            recommendedTrackId: {
              type: Type.STRING,
              description: 'Track id recommendation e.g. midnight-code, tranquil-isle, gentle-piano, coastal-rest, sunrise-stride, sleep-drift',
            },
            ambientAdjustments: {
              type: Type.OBJECT,
              properties: {
                rain: { type: Type.NUMBER },
                waves: { type: Type.NUMBER },
                fire: { type: Type.NUMBER },
                wind: { type: Type.NUMBER },
                cafe: { type: Type.NUMBER },
              },
            },
            rationale: {
              type: Type.STRING,
              description: 'Brief 1-sentence rationale for the music choice.',
            },
            suggestedFollowUps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-3 short, actionable button-sized follow-ups or corrections.',
            },
          },
          required: ['reply', 'recommendedSceneId', 'sceneTitle', 'rationale', 'suggestedFollowUps'],
        },
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout fallback')), 3500)
    );

    const response: any = await Promise.race([geminiPromise, timeoutPromise]);

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error generating agent response:', err?.message || err);
    // On any upstream failure, fallback smoothly to heuristic so UI never errors
    const fallback = heuristicAnalysis(req.body.message || '', req.body.currentScene);
    return res.json(fallback);
  }
});

// Start dev or production server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const host = process.env.HOST || '127.0.0.1';
  const cert = process.env.TLS_CERT_PATH, key = process.env.TLS_KEY_PATH;
  if (!!cert !== !!key) throw Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
  if (production && !cert && process.env.TRUST_LOOPBACK_PROXY !== 'true') throw Error('Production requires HTTPS certificates or a trusted loopback TLS proxy');
  const server = cert ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key!), minVersion: 'TLSv1.2' }, app) : app;
  server.listen(PORT, host, () => console.log(`SoundIsle: ${cert ? 'https' : 'http'}://${host}:${PORT}`));
}

startServer();
