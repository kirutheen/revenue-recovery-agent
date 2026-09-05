import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    '[gemini] GEMINI_API_KEY not set yet. Fill it in backend/.env before ' +
    'running diagnosis or message generation for real.'
  );
}

const genAI = new GoogleGenerativeAI(apiKey || 'placeholder-key');
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
/**
 * Calls Gemini with a prompt and returns the response parsed as JSON.
 * Defensive because models sometimes wrap JSON in ```json fences or add
 * stray whitespace/prose around it — we strip that before parsing.
 */
export async function askGeminiForJSON(prompt, { retries = 2 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      return parseJSONLoose(raw);
    } catch (err) {
      lastError = err;
      const isRateLimit = err.message?.includes('429') || err.message?.includes('quota');
      if (isRateLimit && attempt < retries) {
        const delayMs = 1500 * (attempt + 1);
        console.warn(`[gemini] rate limited, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      break;
    }
  }

  throw new Error(`[gemini] failed after ${retries + 1} attempt(s): ${lastError.message}`);
}

function parseJSONLoose(text) {
  // Strip markdown code fences (```json ... ``` or ``` ... ```) if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  // If there's still leading/trailing prose, try to isolate the outermost {...}
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}
