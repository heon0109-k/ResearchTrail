// Rank passages from several papers and choose what one question sends to the model.
// Pure and deterministic. A chunk is {paper, page, start, end, text} with optional scores.

// Draft values. The single-PDF budget was 6 passages and 10,000 characters; new values need measurement.
export const BUDGET = Object.freeze({ maxChunks: 6, maxChars: 10000, maxPerPaper: 2 });
export const GAP = '\n[중략]\n';
const RRF_K = 60;

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byPosition = (a, b) => byText(a.paper, b.paper) || a.page - b.page || a.start - b.start;

/**
 * Combine keyword and embedding results by reciprocal rank, so neither score scale dominates.
 * `keyword` counts only when above 0; `similarity` counts only when it is a number.
 */
export function rankChunks(chunks) {
  const scores = new Map(chunks.map(c => [c, 0]));
  const lists = [
    chunks.filter(c => c.keyword > 0).sort((a, b) => b.keyword - a.keyword || byPosition(a, b)),
    chunks.filter(c => typeof c.similarity === 'number').sort((a, b) => b.similarity - a.similarity || byPosition(a, b)),
  ];
  for (const list of lists) list.forEach((c, rank) => scores.set(c, scores.get(c) + 1 / (RRF_K + rank + 1)));
  return chunks.filter(c => scores.get(c) > 0)
    .sort((a, b) => scores.get(b) - scores.get(a) || byPosition(a, b));
}

/** Chunks of one paper that mention the figure number named in the question, e.g. "그림 3" or "Fig. 3". */
export function figureChunks(question, chunks, paper) {
  const numbers = new Set();
  for (const m of String(question || '').matchAll(/(?:그림|figure|fig\.?)\s*(\d{1,3})/gi)) numbers.add(m[1]);
  if (!numbers.size) return [];
  const mention = new RegExp('(?:figure|fig\\.?|그림)\\s*(?:' + [...numbers].join('|') + ')(?!\\d)', 'i');
  return chunks.filter(c => c.paper === paper && mention.test(c.text)).sort(byPosition);
}

/**
 * Pick passages within the budget.
 * `priority` chunks (requested page, selected sentence, named figure) are reserved first.
 * A per-paper cap keeps one long paper from taking every slot; unused slots are then filled in rank order.
 * Overlapping chunks on the same page are merged, and separate ranges are joined with GAP.
 */
export function selectPassages(ranked, { priority = [], maxChunks = BUDGET.maxChunks,
  maxChars = BUDGET.maxChars, maxPerPaper = BUDGET.maxPerPaper } = {}) {
  const chosen = [];
  const perPaper = new Map();
  let chars = 0;
  function add(chunk, capped) {
    if (chosen.length >= maxChunks || chosen.includes(chunk)) return;
    if (capped && (perPaper.get(chunk.paper) || 0) >= maxPerPaper) return;
    if (chars + chunk.text.length > maxChars) return;
    chosen.push(chunk);
    chars += chunk.text.length;
    perPaper.set(chunk.paper, (perPaper.get(chunk.paper) || 0) + 1);
  }
  priority.forEach(c => add(c, false));
  ranked.forEach(c => add(c, true));
  ranked.forEach(c => add(c, false));

  const passages = [];
  for (const chunk of [...chosen].sort(byPosition)) {
    const last = passages.at(-1);
    if (last && last.paper === chunk.paper && last.page === chunk.page) {
      if (chunk.start <= last.end) {
        if (chunk.end > last.end) { last.text += chunk.text.slice(last.end - chunk.start); last.end = chunk.end; }
      } else { last.text += GAP + chunk.text; last.end = chunk.end; }
    } else passages.push({ paper: chunk.paper, page: chunk.page, text: chunk.text, end: chunk.end });
  }
  return { passages: passages.map(({ paper, page, text }) => ({ paper, page, text })), chunkCount: chosen.length };
}
