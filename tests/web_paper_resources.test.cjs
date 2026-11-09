// Draft UI regression for PDF link discovery and the bundled-paper reading screen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const bundled = { id: 's8', title: 'Bundled paper', link: 'https://example.org/paper' };
const linkOnly = { id: 's1', title: 'Link-only paper', link: 'https://example.org/abstract' };
const codeUrl = 'https://github.com/example/project';
const dataUrl = 'https://zenodo.org/records/123';

function setup() {
  const nodes = new Map();
  const opened = [];
  const closed = [];
  const context = vm.createContext({
    URL,
    S: { papers: [bundled, linkOnly], links: [], reader: bundled.id },
    $(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { addEventListener() {}, removeAttribute() {} });
      return nodes.get(selector);
    },
    $$: () => [],
    paperBy: id => [bundled, linkOnly].find(p => p.id === id),
    samplePdfUrl: paper => paper === bundled ? 'assets/papers/graphrag-v1.pdf' : null,
    esc: String,
    short: (text, length) => text.slice(0, length),
    stateOpts: () => '',
    preparePaperHistory() {},
    drawHlList() {},
    wireReadingRecords() {},
    naInit() {},
    renderHistory() {},
    pdfjsLib: {
      getDocument(source) {
        opened.push(source);
        return {
          promise: Promise.resolve({
            numPages: 2,
            getPage: n => ({
              getAnnotations: () => n === 1 ? [{ url: codeUrl }, { url: 'javascript:alert(1)' }] : [],
              getTextContent: () => ({ items: [{ str: n === 1 ? codeUrl : dataUrl + '.' }] }),
              cleanup() {}
            })
          }),
          async destroy() { closed.push(true); }
        };
      }
    }
  });
  for (const file of ['import.js', 'pdf-viewer.js', 'panel.js', 'reader.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/js', file), 'utf8'), context);
  }
  context.loadPdfJs = async () => {};
  context.wirePaperResources = () => {};
  return { context, nodes, opened, closed };
}

test('the reading screen offers link discovery for a bundled sample PDF', () => {
  const { context, nodes } = setup();
  context.renderRNotes();
  assert.match(nodes.get('#rdnotes').innerHTML, /id="rResources"/);
  assert.match(nodes.get('#rdnotes').innerHTML, /인용한 자료의 링크도 포함될 수 있어요/);
  context.S.reader = linkOnly.id;
  context.renderRNotes();
  assert.doesNotMatch(nodes.get('#rdnotes').innerHTML, /id="rResources"/);
});

test('PDF scan keeps safe unique candidates with their page and never auto-saves them', async () => {
  const { context, opened, closed } = setup();
  await context.scanPaperResources(bundled);
  const state = context.paperResourceScan(bundled);
  assert.equal(state.status, 'done');
  assert.deepEqual(JSON.parse(JSON.stringify(state.candidates)), [
    { url: codeUrl, kind: 'code', page: 1 },
    { url: dataUrl, kind: 'data', page: 2 }
  ]);
  assert.equal(bundled.resources, undefined);
  assert.equal(opened[0].url, 'assets/papers/graphrag-v1.pdf');
  assert.equal(opened[0].isEvalSupported, false);
  assert.equal(closed.length, 1);
});
