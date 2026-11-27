// Asks the answer model for a reply in the fixed answer format. The request shape follows the project's
// existing local server (scripts/serve_openai.py). The model name and the time limit are drafts.
import { ANSWER_SCHEMA } from './answer.mjs';

export const DEFAULT_ANSWER_MODEL = 'gpt-6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const TIMEOUT_MS = 60000;

// Returns the parsed reply. Any failure throws without the service's own message.
export async function generateAnswer(prompt, { fetch, key, model = DEFAULT_ANSWER_MODEL }) {
  if (!key) throw new Error('answer key is not configured');
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, input: prompt, store: false, reasoning: { effort: 'none' }, max_output_tokens: 3000,
        text: { format: { type: 'json_schema', name: 'researchtrail_answer', strict: true, schema: ANSWER_SCHEMA } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('answer service did not respond');
  }
  if (!response.ok) throw new Error('answer service refused the request');
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (data?.status !== 'completed') throw new Error('answer service returned an incomplete reply');
  let text = '';
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === 'refusal') throw new Error('answer service declined');
      if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
    }
  }
  try { return JSON.parse(text); } catch { throw new Error('answer service returned an unreadable reply'); }
}
