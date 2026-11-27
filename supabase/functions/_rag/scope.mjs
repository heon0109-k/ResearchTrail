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
