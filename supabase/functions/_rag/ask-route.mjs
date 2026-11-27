// The unified reader searches the open PDF edition. Older callers also search linked papers.
// The handler has already verified the caller; every database call here uses that caller's session.
import { embedTexts } from './embedding.mjs';
import { selectLinkedEditions } from './scope.mjs';
import { rankChunks, figureChunks, selectPassages } from './ranking.mjs';
import { keywordScores, pagePriority } from './keyword.mjs';
import { labelPapers, buildPrompt, verifyAnswer, NOT_FOUND } from './answer.mjs';
import { ANSWER_DEPTHS, resolveAnswerEffort, generateAnswer } from './generate.mjs';

// Draft limits.
export const MATCH_COUNT = 40;
const MAX_QUESTION = 1000, MAX_SELECTION = 1000, MAX_HISTORY = 6, MAX_HISTORY_TEXT = 1200;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, fields) => isObject(value) && Object.keys(value).every(key => fields.includes(key));
const text = (value, max) => typeof value === 'string' && /\S/.test(value) && value.length <= max;
const page = value => value == null || (Number.isInteger(value) && value >= 1);

function validQuestion(body) {
  return hasOnly(body, ['question', 'current_page', 'selection', 'history', 'consent', 'scope', 'answer_depth']) &&
    body.consent === true && (body.scope === undefined || ['open_pdf', 'linked_papers'].includes(body.scope)) &&
    (body.answer_depth === undefined || ANSWER_DEPTHS.includes(body.answer_depth)) &&
    text(body.question, MAX_QUESTION) && page(body.current_page) &&
    (body.selection == null || (hasOnly(body.selection, ['text', 'page']) && text(body.selection.text, MAX_SELECTION) && page(body.selection.page))) &&
    (body.history == null || (Array.isArray(body.history) && body.history.length <= MAX_HISTORY && body.history.every(turn =>
      hasOnly(turn, ['role', 'text']) && ['user', 'bot'].includes(turn.role) && text(turn.text, MAX_HISTORY_TEXT))));
}

export async function ragAsk(request, { task, artifact }, { backend, rpc, cors, fail }) {
  if (request.method !== 'POST') return fail(405, 'INVALID_INPUT');
  let body;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_INPUT'); }
  // A question sends the question and the chosen passages to outside services, so it needs explicit consent.
  if (!validQuestion(body)) return fail(400, 'INVALID_INPUT');
  if (!backend.openaiKey) return fail(500, 'STORAGE_FAILURE');
  const outside = { fetch: backend.fetch, key: backend.openaiKey };

  // Nothing leaves unless this caller has a finished index for the open edition.
  const status = await rpc('rt_rag_index_status', { task_id: task });
  if (!status.ok) return status;
  const open = (await status.json())?.artifacts?.find(item => item.artifact_id?.toLowerCase() === artifact);
  if (!open) return fail(404, 'RESOURCE_UNAVAILABLE');
  if (open.index?.status !== 'ready') return fail(400, 'INVALID_INPUT');
  const model = open.index.embedding_model;
  let vector;
  try { [vector] = await embedTexts([body.question], { ...outside, model }); } catch { return fail(503, 'STORAGE_FAILURE'); }

  const openPdfOnly = body.scope === 'open_pdf';
  let searched = [{ document_use_id: open.document_use_id, artifact_id: open.artifact_id, title: null }];
  let excluded = [];
  if (!openPdfOnly) {
    const listed = await rpc('rt_rag_scope', { task_id: task, query_embedding: vector });
    if (!listed.ok) return listed;
    ({ searched, excluded } = selectLinkedEditions(open, await listed.json()));
    if (searched[0]?.document_use_id !== open.document_use_id) return fail(400, 'INVALID_INPUT');
  }
  const labels = labelPapers(searched.map(item => item.document_use_id));
  for (const item of searched) item.label = labels.get(item.document_use_id);

  const found = await rpc('rt_rag_search', { task_id: task, payload: {
    artifact_ids: searched.map(item => item.artifact_id), embedding: vector, match_count: MATCH_COUNT, current_artifact_id: open.artifact_id,
  } });
  if (!found.ok) return found;
  const { matches = [], current = [] } = await found.json();
  const chunks = new Map();
  const chunk = (row, similarity) => {
    const key = row.artifact_id + '/' + row.page + '/' + row.start;
    if (!chunks.has(key)) chunks.set(key, { paper: row.document_use_id, page: row.page, start: row.start, end: row.end, text: row.text });
    if (similarity) chunks.get(key).similarity = row.similarity;
    return chunks.get(key);
  };
  // Only the closest passages carry a similarity. The open paper's other passages compete on keywords alone.
  for (const row of matches) {
    if (searched.some(item => item.artifact_id === row.artifact_id && item.document_use_id === row.document_use_id)) chunk(row, true);
  }
  const opened = current.filter(row => row.artifact_id === open.artifact_id && row.document_use_id === open.document_use_id)
    .map(row => chunk(row, false));
  keywordScores(body.question, opened).forEach((score, i) => { opened[i].keyword = score; });
  const priority = [...pagePriority(body.question, opened, { currentPage: body.current_page, selection: body.selection }),
    ...figureChunks(body.question, opened, open.document_use_id)];
  const { passages } = selectPassages(rankChunks([...chunks.values()]), { priority });
  const reply = (kind, answer, evidence) => Response.json({ kind, text: answer, evidence, searched, excluded }, { headers: cors });
  if (!passages.length) return reply('notfound', NOT_FOUND, []);

  const sent = passages.map(p => ({ label: labels.get(p.paper), page: p.page, text: p.text }));
  const prompt = buildPrompt({
    papers: searched.map(item => ({ label: item.label, title: item.title })), passages: sent, question: body.question,
    currentPage: body.current_page ?? undefined, history: body.history ?? [], excludedCount: excluded.length, openPdfOnly,
    selection: body.selection ? { label: labels.get(open.document_use_id), page: body.selection.page ?? null, text: body.selection.text } : undefined,
  });
  const effort = resolveAnswerEffort(body.answer_depth, body.question);
  let raw;
  try { raw = await generateAnswer(prompt, { ...outside, model: backend.answerModel?.trim() || undefined, effort }); }
  catch { return fail(503, 'STORAGE_FAILURE'); }
  // Only an answer whose quotes are found in the passages that were sent is shown as an answer.
  const result = verifyAnswer(raw, sent, { openPdfOnly });
  if (result.kind === 'error') return fail(503, 'STORAGE_FAILURE');
  const paperOf = new Map(searched.map(item => [item.label, item]));
  return reply(result.kind, result.text, result.evidence.map(item => ({
    document_use_id: paperOf.get(item.label).document_use_id, artifact_id: paperOf.get(item.label).artifact_id,
    label: item.label, page: item.page, quote: item.quote,
  })));
}
