import { chmod, cp, copyFile, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
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
const staging = await mkdtemp(path.join(root, '.dist-'));
try {
  const publicFiles = ['index.html', 'style.css', 'tag-menu.css', 'views', 'js', 'styles', 'assets', 'vendor'];
  for (const name of publicFiles) {
    await cp(path.join(source, name), path.join(staging, name), {
      recursive: true,
      filter: async file => {
        const entry = path.basename(file);
        return !entry.startsWith('.') && entry !== 'private' && !(await lstat(file)).isSymbolicLink();
      },
    });
  }
  const sdk = path.join(root, 'node_modules/@supabase/supabase-js');
  const vendor = path.join(staging, 'vendor/supabase');
  await mkdir(vendor);
  await copyFile(path.join(sdk, 'dist/umd/supabase.js'), path.join(vendor, 'supabase.js'));
  await copyFile(path.join(sdk, 'LICENSE'), path.join(vendor, 'LICENSE'));
  await writeFile(path.join(staging, 'js/browser-config.js'),
    'window.RESEARCHTRAIL_CONFIG = Object.freeze(' + JSON.stringify(config, null, 2) + ');\n');
  await chmod(staging, 0o755);
  await rm(dist, { recursive: true, force: true });
  await rename(staging, dist);
} finally {
  await rm(staging, { recursive: true, force: true });
}
