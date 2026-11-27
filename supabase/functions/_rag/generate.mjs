// Asks the answer model for a reply in the fixed answer format. The request shape follows the project's
// existing local server (scripts/serve_openai.py). The model may be overridden on the server.
import { ANSWER_SCHEMA } from './answer.mjs';

export const DEFAULT_ANSWER_MODEL = 'gpt-6-luna';
export const ANSWER_DEPTHS = Object.freeze(['auto', 'none', 'low', 'medium']);

// Port of the classic browser script's chatResolveEffort. An omitted choice preserves the legacy effort.
export function resolveAnswerEffort(choice = 'none', question) {
  if (choice !== 'auto') return choice;
  if (/비교|차이|종합|근거.{0,12}결론|왜|원인|장단점|\b(?:compar(?:e[ds]?|ing|isons?)|contrast(?:s|ing)?|differ(?:s|ences?)?|synthesi[sz]e|synthesis|why)\b/i.test(question)) return 'medium';
  if (/몇|얼마|무엇의 약자|뜻이 뭐|무슨 뜻|어느\s*(?:쪽|페이지)|(?:어떤|어느)\s*데이터셋|\b(?:how many|how much|stands? for|(?:which|what) (?:page|dataset|year))\b/i.test(question)) return 'none';
  return 'low';
}

const ENDPOINT = 'https://api.openai.com/v1/responses';
const TIMEOUT_MS = 60000;

// Returns the parsed reply. Any failure throws without the service's own message.
export function generateAnswer(prompt, options) {
  return generateStructured(prompt,{...options,name:'researchtrail_answer',schema:ANSWER_SCHEMA});
}

export async function generateStructured(prompt, {fetch,key,model=DEFAULT_ANSWER_MODEL,effort='none',name,schema,instructions}) {
  if (!key) throw new Error('answer key is not configured');
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, input: prompt, instructions, store: false, reasoning: { effort }, max_output_tokens: 3000,
        text: { format: { type: 'json_schema', name, strict: true, schema } },
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
