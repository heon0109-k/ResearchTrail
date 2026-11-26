// Step 2 build regressions for the browser demo (SPEC §§7.5–7.6).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const buildScript = path.join(root, 'scripts/build-web.mjs');

test('build preserves static assets and replaces stale output with deterministic public config', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'researchtrail-build-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  // Run the production entry point in an isolated project, including its real static files.
  fs.mkdirSync(path.join(work, 'scripts'));
  fs.copyFileSync(buildScript, path.join(work, 'scripts/build-web.mjs'));
  const fixtureWeb = path.join(work, 'web');
  fs.cpSync(web, fixtureWeb, {
    recursive: true,
    filter: file => {
      const name = path.basename(file);
      return !name.startsWith('.') && name !== 'private' && !fs.lstatSync(file).isSymbolicLink();
    },
  });
  const publicPaths = fs.readdirSync(fixtureWeb, { recursive: true });
  fs.writeFileSync(path.join(fixtureWeb, 'js/.local-only'), 'synthetic-canary');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'junction');
  const dist = path.join(work, 'dist');
  const configFile = path.join(dist, 'js/browser-config.js');
  const configPath = 'js/browser-config.js';
  async function build(env = {}) {
    await execFile(process.execPath, ['scripts/build-web.mjs'], { cwd: work, env });
    const window = {};
    vm.runInNewContext(fs.readFileSync(configFile, 'utf8'), { window });
    return { ...window.RESEARCHTRAIL_CONFIG };
  }

  const empty = { SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' };
  const configured = {
    SUPABASE_URL: 'https://project.example.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  };
  assert.deepEqual(await build({ ...configured, UNRELATED_SETTING: 'synthetic-canary' }), configured);
  assert.ok(!fs.readFileSync(configFile, 'utf8').includes('synthetic-canary'));
  assert.ok(!fs.existsSync(path.join(dist, 'js/.local-only')));
  assert.deepEqual(fs.readFileSync(path.join(dist, 'vendor/supabase/supabase.js')),
    fs.readFileSync(path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')));
  fs.writeFileSync(path.join(dist, 'obsolete.js'), 'old build');
  assert.deepEqual(await build(), empty);
  assert.ok(!fs.existsSync(path.join(dist, 'obsolete.js')));
  const first = fs.readFileSync(configFile);
  await build();
  assert.deepEqual(fs.readFileSync(configFile), first);

  for (const name of publicPaths) {
    const source = path.join(fixtureWeb, name);
    if (fs.statSync(source).isFile() && name !== path.normalize(configPath)) {
      assert.deepEqual(fs.readFileSync(path.join(dist, name)), fs.readFileSync(source), name);
    }
  }
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.ok(html.includes('src="' + configPath + '"'));
  assert.ok(html.indexOf(configPath) < html.indexOf('js/core.js'));
  const papers = JSON.parse(fs.readFileSync(path.join(dist, 'assets/papers/manifest.json')));
  for (const paper of papers) {
    if (!paper.file) continue;
    const bytes = fs.readFileSync(path.join(dist, 'assets/papers', paper.file));
    assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), paper.sha256);
  }
  // Resolve the same bundled source the reader uses, then decode it with the shipped worker.
  const demo = { S: { example: true } };
  vm.runInNewContext(fs.readFileSync(path.join(dist, 'js/sample-papers.js'), 'utf8'), demo);
  const sample = papers.find(paper => paper.id === 's2');
  const url = demo.samplePdfUrl({ id: sample.id, title: sample.title, link: sample.source });
  const viewerDir = path.join(dist, 'vendor/pdfjs-3.11.174');
  const pdfjs = require(path.join(viewerDir, 'pdf.min.js'));
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(viewerDir, 'pdf.worker.min.js');
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(path.join(dist, url))), isEvalSupported: false,
  }).promise;
  try {
    assert.equal(pdf.numPages, sample.pages);
    const text = await (await pdf.getPage(1)).getTextContent();
    assert.match(text.items.map(item => item.str).join(' '), /BERT/);
  } finally {
    await pdf.destroy();
  }
  await assert.rejects(build({ SUPABASE_URL: configured.SUPABASE_URL }), /SUPABASE_PUBLISHABLE_KEY/);
  await assert.rejects(build({ ...configured, SUPABASE_PUBLISHABLE_KEY: 'wrong-key-type' }), /publishable key/);
  assert.deepEqual(fs.readFileSync(configFile), first);
});
