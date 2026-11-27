// Keyword score and page rules for the open paper, carried over from web/js/chat-retrieval.js so the
// single-PDF behaviour is kept (docs/spikes/linked_papers_rag.md 3.4). Pure and deterministic.

const stop = new Set(('a an and are as at be by for from has have how in is it of on or that the this to was we what which with ' +
  '논문 논문의 본문 실험 조건 각각 어떤 어떻게 무엇 뭐야 사용해 알려줘 설명해 주세요 비교해 줘').split(/\s+/));

function normalize(text) {
  return String(text || '').normalize('NFKC').replace(/­/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim();
}
function wordKey(word) {
  if (!/^[a-z]{4,}$/.test(word)) return word;
  if (word.length > 5 && /ies$/.test(word)) word = word.slice(0, -3) + 'y';
  else if ((word.length > 5 && /ing$/.test(word)) || (word.length > 4 && /ed$/.test(word))) {
    word = word.replace(/(?:ing|ed)$/, '').replace(/([b-df-hj-np-tv-z])\1$/, '$1');
  } else if (word.length > 4 && /s$/.test(word) && !/(?:ss|us|is)$/.test(word)) word = word.slice(0, -1);
  if (word.length > 4 && /e$/.test(word)) word = word.slice(0, -1);
  return word;
}
export function tokens(text) {
  const words = normalize(text).toLowerCase().match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[가-힣]{2,}|\d+\.\d+(?:\.\d+)*/g) || [];
  return words.flatMap(t => (t.includes('-') ? [t, ...t.split('-')] : [t])).filter(t => t.length > 1 && !stop.has(t)).map(wordKey);
}

/** One score per chunk, in the order given. Distinct question terms count once each; rare terms weigh more. */
export function keywordScores(question, chunks) {
  const terms = [...new Set(tokens(question))];
  const seen = chunks.map(chunk => new Set(tokens(chunk.text)));
  const frequency = new Map();
  for (const set of seen) for (const term of set) frequency.set(term, (frequency.get(term) || 0) + 1);
  const active = terms.filter(term => frequency.has(term));
  return seen.map(set => {
    let score = 0, hits = 0;
    for (const term of active) {
      if (!set.has(term)) continue;
      hits += 1;
      score += 1 + Math.log(1 + chunks.length / frequency.get(term));
    }
    return score * (1 + hits);
  });
}

/** Pages the question points at: a page it names, the selected sentence's page, "this page", or page 1 for a summary. */
export function priorityPages(question, { currentPage, selectedPage } = {}) {
  const pages = [];
  const add = n => { if (Number.isInteger(n) && n >= 1 && !pages.includes(n)) pages.push(n); };
  const named = [];
  for (const m of String(question || '').matchAll(/(?:\bp\.?\s*(\d{1,3})\b)|(?:\bpage\s+(\d{1,3})\b)|(?:(\d{1,3})\s*(?:쪽|페이지))/gi)) {
    const n = Number(m[1] || m[2] || m[3]);
    if (n >= 1 && !named.includes(n)) named.push(n);
  }
  named.slice(0, 2).forEach(add);
  add(selectedPage);
  if (/이\s*쪽|이\s*페이지|여기|이\s*표|이\s*그림|이\s*수식|this\s+page/i.test(question)) add(currentPage || 1);
  if (/핵심|초록|논문.*(뭐|무엇)|기여|(?:논문|전체|내용)(?:을|를)?\s*요약|^요약|^전체/.test(question)) add(1);
  return pages;
}

/**
 * Up to two chunks of the open paper for each priority page, best keyword score first.
 * On the selected sentence's page, the chunk that contains the sentence comes first.
 * `chunks` must carry a numeric `keyword`.
 */
export function pagePriority(question, chunks, { currentPage, selection } = {}) {
  const pages = priorityPages(question, { currentPage, selectedPage: selection?.page });
  const selected = normalize(selection?.text).slice(0, 100);
  const chosen = [];
  for (let round = 0; round < 2; round++) {
    for (const page of pages) {
      const candidates = chunks.filter(c => c.page === page && !chosen.includes(c))
        .sort((a, b) => (b.keyword || 0) - (a.keyword || 0) || a.start - b.start);
      const holder = page === selection?.page && selected && candidates.find(c => normalize(c.text).includes(selected));
      if (holder || candidates[0]) chosen.push(holder || candidates[0]);
    }
  }
  return chosen;
}
