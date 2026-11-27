import { chmod, copyFile, mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'web');
const dist = path.join(root, 'dist');
const url = process.env.SUPABASE_URL?.trim() || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';
if (Boolean(url) !== Boolean(key)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or leave both unset.');
}
if (url) {
  const parsed = URL.canParse(url) && new URL(url);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must be a public HTTP(S) project URL.');
  }
  if (!key.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key.');
  }
}
const config = { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };

// Reviewed website inputs. The build also generates browser-config.js and copies the pinned SDK.
const website = {
  '.': ['index.html', 'style.css'],
  'assets/papers': [
    'almanac-v2.pdf', 'bert-naacl2019.pdf', 'biobert-published.pdf', 'chain-of-thought-v6.pdf',
    'clinical-knowledge-v1.pdf', 'credits.html', 'graphrag-v1.pdf', 'manifest.json', 'self-rag-v1.pdf',
  ],
  'assets/papers/captures': [
    'biobert-qa-results.png', 'cot-prompt-example.png', 'graphrag-pipeline.png', 'graphrag-results.png',
  ],
  'js': [
    'account-actions.js', 'account-memos.js', 'account-pdfs.js', 'account-projects.js',
    'account-save-status.js', 'account.js', 'ai-stub.js', 'ai-summary.js', 'capture.js',
    'chat-query-expansion.js', 'chat-retrieval.js', 'chat.js', 'core.js', 'date-picker.js', 'find.js', 'frame.js',
    'graph.js', 'helpers.js', 'import.js', 'landing.js', 'main.js', 'next-action.js', 'onboarding.js',
    'panel.js', 'paper-list.js', 'pdf-viewer.js', 'projects.js', 'reader.js', 'records-compact.js',
    'sample-papers.js', 'screens.js', 'timeline-mobile.js', 'timeline.js', 'tooltip.js', 'tour.js',
  ],
  'styles': [
    'account.css', 'ai-summary.css', 'chat.css', 'date-picker.css', 'graph.css', 'landing.css', 'navigation.css',
    'onboarding.css', 'paper-credits.css', 'paper-list.css', 'paper-panel.css', 'pdf-viewer.css',
    'projects.css', 'reader.css', 'reading-records.css', 'resume.css', 'search.css', 'tag-menu.css', 'timeline.css', 'tooltip.css',
  ],
  'vendor/pdfjs-3.11.174': ['LICENSE', 'pdf.min.js', 'pdf.worker.min.js'],
  'views': [
    'account-projects.html', 'account.html', 'landing.html', 'main.html', 'onboarding.html',
    'reader.html',
  ],
};

const staging = await mkdtemp(path.join(root, '.dist-'));
try {
  for (const [directory, files] of Object.entries(website)) {
    const target = path.join(staging, directory);
    await mkdir(target, { recursive: true });
    for (const name of files) {
      const file = path.join(source, directory, name);
      if (await realpath(file) !== file) throw new Error('Linked website input: ' + path.join(directory, name));
      await copyFile(file, path.join(target, name));
    }
  }
  const sdk = path.join(root, 'node_modules/@supabase/supabase-js');
  const vendor = path.join(staging, 'vendor/supabase');
  await mkdir(vendor);
  await copyFile(path.join(sdk, 'dist/umd/supabase.js'), path.join(vendor, 'supabase.js'));
  await copyFile(path.join(sdk, 'LICENSE'), path.join(vendor, 'LICENSE'));
  if (url) {
    // The account page owns Auth. The local workspace keeps its original document and storage.
    await rename(path.join(staging, 'index.html'), path.join(staging, 'browser.html'));
    await copyFile(path.join(staging, 'views/account.html'), path.join(staging, 'index.html'));
  }
  await writeFile(path.join(staging, 'js/browser-config.js'),
    'window.RESEARCHTRAIL_CONFIG = Object.freeze(' + JSON.stringify(config, null, 2) + ');\n');
  await chmod(staging, 0o755);
  await rm(dist, { recursive: true, force: true });
  await rename(staging, dist);
} finally {
  await rm(staging, { recursive: true, force: true });
}
