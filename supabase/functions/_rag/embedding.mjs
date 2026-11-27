// Turns passages into vectors with the external embedding service (docs/spikes/linked_papers_rag.md 3.3, 3.7).
// The model name and the time limit are drafts. The vector size must match the database column.
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const ENDPOINT = 'https://api.openai.com/v1/embeddings';
const TIMEOUT_MS = 30000;

// Returns one vector per text, in the order given. Any failure throws without the service's own message,
// which may quote the text that was sent.
export async function embedTexts(texts, { fetch, key, model = DEFAULT_EMBEDDING_MODEL }) {
  if (!key) throw new Error('embedding key is not configured');
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('embedding service did not respond');
  }
  if (!response.ok) throw new Error('embedding service refused the request');
  let rows;
  try { rows = (await response.json())?.data; } catch { rows = null; }
  if (!Array.isArray(rows) || rows.length !== texts.length) throw new Error('embedding service returned the wrong number of vectors');
  const vectors = new Array(texts.length);
  for (const row of rows) {
    const vector = row?.embedding;
    if (!Number.isInteger(row?.index) || row.index < 0 || row.index >= texts.length || vectors[row.index] ||
        !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
      throw new Error('embedding service returned an unusable vector');
    }
    vectors[row.index] = vector;
  }
  return vectors;
}
