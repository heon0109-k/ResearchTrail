// Which papers one question may search: the open paper plus up to eight linked papers.
// Pure and deterministic. The caller passes only the signed-in owner's papers and links.

export const MAX_LINKED = 8;

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {object} input
 * @param {string} input.current   ID of the open paper.
 * @param {{id:string, hasPdf:boolean, indexed:boolean}[]} input.papers
 * @param {{from:string, to:string}[]} input.links   Direction is ignored.
 * @param {Record<string, number>} [input.relevance] Question relevance per paper; missing means 0.
 * @returns {{searched:string[], excluded:{id:string, reason:string, distance:number}[]}}
 *   `searched` lists the open paper first, then linked papers in selection order.
 *   `excluded` lists linked papers left out, so the UI never implies they were searched.
 *   Papers with no path to the open paper are outside the scope and appear in neither list.
 */
export function selectScope({ current, papers, links, relevance = {}, maxLinked = MAX_LINKED }) {
  const known = new Map(papers.map(p => [p.id, p]));
  if (!known.has(current)) return { searched: [], excluded: [] };

  const neighbours = new Map();
  for (const { from, to } of links) {
    if (from === to || !known.has(from) || !known.has(to)) continue;
    if (!neighbours.has(from)) neighbours.set(from, new Set());
    if (!neighbours.has(to)) neighbours.set(to, new Set());
    neighbours.get(from).add(to);
    neighbours.get(to).add(from);
  }

  // Breadth-first search gives the fewest links between the open paper and each other paper.
  const distance = new Map([[current, 0]]);
  for (let queue = [current]; queue.length;) {
    const next = [];
    for (const id of queue) {
      for (const other of neighbours.get(id) || []) {
        if (distance.has(other)) continue;
        distance.set(other, distance.get(id) + 1);
        next.push(other);
      }
    }
    queue = next;
  }

  const excluded = [];
  const eligible = [];
  for (const [id, hops] of distance) {
    if (id === current) continue;
    const paper = known.get(id);
    if (!paper.hasPdf) excluded.push({ id, reason: 'no_pdf', distance: hops });
    else if (!paper.indexed) excluded.push({ id, reason: 'not_indexed', distance: hops });
    else eligible.push({ id, distance: hops, relevance: Number(relevance[id]) || 0 });
  }
  eligible.sort((a, b) => a.distance - b.distance || b.relevance - a.relevance || byText(a.id, b.id));
  for (const paper of eligible.slice(maxLinked)) {
    excluded.push({ id: paper.id, reason: 'over_limit', distance: paper.distance });
  }
  excluded.sort((a, b) => a.distance - b.distance || byText(a.id, b.id));

  const open = known.get(current);
  const searched = eligible.slice(0, maxLinked).map(p => p.id);
  if (open.hasPdf && open.indexed) searched.unshift(current);
  else excluded.unshift({ id: current, reason: open.hasPdf ? 'not_indexed' : 'no_pdf', distance: 0 });
  return { searched, excluded };
}

// Choose one compatible edition per paper for callers using the linked-paper scope.
export function selectLinkedEditions(open, { papers = [], links = [] }) {
  const edition = new Map(), relevance = {}, titles = new Map();
  const candidates = papers.map(paper => {
    const pdfs = Array.isArray(paper.editions) ? paper.editions : [];
    // Vectors from another embedding model cannot be compared with this question's vector.
    let usable = pdfs.filter(e => e.status === 'ready' && e.embedding_model === open.index.embedding_model);
    if (paper.document_use_id === open.document_use_id) usable = usable.filter(e => e.artifact_id === open.artifact_id);
    // A paper with several usable editions is searched through the one closest to the question, not the newest.
    usable.sort((a, b) => b.similarity - a.similarity || byText(a.artifact_id, b.artifact_id));
    if (usable[0]) { edition.set(paper.document_use_id, usable[0].artifact_id); relevance[paper.document_use_id] = usable[0].similarity; }
    titles.set(paper.document_use_id, paper.title ?? null);
    return { id: paper.document_use_id, hasPdf: pdfs.length > 0, indexed: usable.length > 0 };
  });
  const scope = selectScope({ current: open.document_use_id, papers: candidates, relevance,
    links: links.map(link => ({ from: link.from_document_use_id, to: link.to_document_use_id })) });

  return {
    searched: scope.searched.map(id => ({ document_use_id: id, artifact_id: edition.get(id), title: titles.get(id) })),
    excluded: scope.excluded.map(item => ({ document_use_id: item.id, reason: item.reason, distance: item.distance })),
  };
}
