// Audit an existing static build against the website in this checkout. Print counts, never config values.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'));
const tracked = execFileSync('git', ['ls-files', '-z', '--', 'web/'], {cwd:root, encoding:'utf8'});
const expected = new Map(tracked.split('\0').filter(Boolean).map(name => [name.slice(4), path.join(root,name)]));
assert.ok(expected.has('index.html'), 'Run this check in the ResearchTrail checkout.');

const entries = await readdir(dist, {recursive:true, withFileTypes:true});
const names = entries.filter(entry => !entry.isDirectory()).map(entry => {
  assert.ok(entry.isFile(), 'Static output must contain only regular files.');
  return path.relative(dist,path.join(entry.parentPath,entry.name)).split(path.sep).join('/');
}).sort();

const script = await readFile(path.join(dist, 'js/browser-config.js'), 'utf8');
const match = /^window\.RESEARCHTRAIL_CONFIG = Object\.freeze\((\{[\s\S]*\})\);\n$/.exec(script);
assert.ok(match, 'Unexpected browser configuration script.');
let config;
try { config = JSON.parse(match[1]); }
catch { throw new Error('Invalid browser configuration JSON.'); }
assert.deepEqual(Object.keys(config).sort(), ['SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL']);
const {SUPABASE_URL:url, SUPABASE_PUBLISHABLE_KEY:key} = config;
assert.ok(script === 'window.RESEARCHTRAIL_CONFIG = Object.freeze('+
  JSON.stringify({SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key},null,2)+');\n', 'Unexpected configuration bytes.');
const demo = url === '' && key === '';
if (!demo) {
  const parsed = typeof url === 'string' && URL.canParse(url) && new URL(url);
  assert.ok(parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username &&
    !parsed.password && !parsed.search && !parsed.hash, 'Expected a public project URL.');
  assert.ok(typeof key === 'string' && key.startsWith('sb_publishable_'), 'Expected a publishable key.');
  expected.set('browser.html', expected.get('index.html'));
  expected.set('index.html', expected.get('views/account.html'));
}
const sdk = path.join(root, 'node_modules/@supabase/supabase-js');
expected.set('vendor/supabase/supabase.js', path.join(sdk,'dist/umd/supabase.js'));
expected.set('vendor/supabase/LICENSE', path.join(sdk,'LICENSE'));

assert.deepEqual(names, [...expected.keys()].sort());
for (const name of names) {
  if (name === 'js/browser-config.js') continue;
  const [built, source] = await Promise.all([readFile(path.join(dist,name)), readFile(expected.get(name))]);
  assert.ok(built.equals(source), 'Unexpected file contents: '+name);
}
const pdfCount = names.filter(name => name.endsWith('.pdf')).length;
console.log('Verified '+names.length+' static files, '+pdfCount+' bundled PDFs and two public config fields ('+
  (demo ? 'browser demo' : 'account preview')+').');
