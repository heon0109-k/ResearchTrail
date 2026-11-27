// HTTP steps for indexing one uploaded PDF edition (docs/spikes/linked_papers_rag.md 5절).
// The handler has already verified the caller; every database call here uses that caller's session.
import { embedTexts, DEFAULT_EMBEDDING_MODEL } from './embedding.mjs';

// Draft limits. The database accepts at most 100 passages a call and 4,000 characters a passage.
export const MAX_BATCH = 32;
const MAX_TEXT = 4000;
const hasOnly = (body, fields) => body && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).every(key => fields.includes(key));
const validChunk = chunk => hasOnly(chunk, ['page', 'start', 'end', 'text']) &&
  Number.isInteger(chunk.page) && chunk.page > 0 && Number.isInteger(chunk.start) && chunk.start >= 0 &&
  Number.isInteger(chunk.end) && chunk.end > chunk.start &&
  typeof chunk.text === 'string' && /\S/.test(chunk.text) && chunk.text.length <= MAX_TEXT;

export async function ragIndex(request, { task, artifact, step }, { backend, rpc, cors, fail }) {
  async function reply(name, args, status) {
    const result = await rpc(name, args);
    return result.ok ? Response.json(await result.json(), { status, headers: cors }) : result;
  }
  if (!artifact && !step) {
    if (request.method !== 'GET') return fail(405, 'INVALID_INPUT');
    return reply('rt_rag_index_status', { task_id: task }, 200);
  }
  if (!artifact || !step) return fail(404, 'RESOURCE_UNAVAILABLE');
  if (request.method !== 'POST') return fail(405, 'INVALID_INPUT');
  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT'); }
  const target = { task_id: task, artifact_id: artifact };

  if (step === 'finish') {
    if (!hasOnly(body, ['chunk_count']) || !Number.isInteger(body.chunk_count) || body.chunk_count < 1) return fail(400, 'INVALID_INPUT');
    return reply('rt_rag_finish_index', { ...target, chunk_count: body.chunk_count }, 200);
  }
  if (step === 'begin') {
    // Indexing sends the paper's whole text to the embedding service, so it starts only on explicit consent.
    if (!hasOnly(body, ['pdf_sha256', 'chunker', 'consent']) || body.consent !== true ||
        typeof body.pdf_sha256 !== 'string' || typeof body.chunker !== 'string') return fail(400, 'INVALID_INPUT');
    if (!backend.openaiKey) return fail(500, 'STORAGE_FAILURE');
    return reply('rt_rag_begin_index', { ...target, payload: {
      pdf_sha256: body.pdf_sha256, chunker: body.chunker, embedding_model: backend.embeddingModel || DEFAULT_EMBEDDING_MODEL,
    } }, 201);
  }

  if (!hasOnly(body, ['chunks']) || !Array.isArray(body.chunks) || body.chunks.length < 1 ||
      body.chunks.length > MAX_BATCH || !body.chunks.every(validChunk)) return fail(400, 'INVALID_INPUT');
  if (!backend.openaiKey) return fail(500, 'STORAGE_FAILURE');
  // Nothing leaves for the embedding service unless this caller has a started index for this edition.
  const status = await rpc('rt_rag_index_status', { task_id: task });
  if (!status.ok) return status;
  const entry = (await status.json())?.artifacts?.find(item => item.artifact_id?.toLowerCase() === artifact);
  if (!entry) return fail(404, 'RESOURCE_UNAVAILABLE');
  if (entry.index?.status !== 'indexing') return fail(400, 'INVALID_INPUT');
  let vectors;
  try {
    vectors = await embedTexts(body.chunks.map(chunk => chunk.text),
      { fetch: backend.fetch, key: backend.openaiKey, model: entry.index.embedding_model });
  } catch {
    return fail(503, 'STORAGE_FAILURE');
  }
  return reply('rt_rag_add_chunks', { ...target,
    chunks: body.chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] })) }, 201);
}
