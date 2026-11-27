// Exercise the root build in a clean directory, with extra files that must stay out of the site.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {promisify} = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '..');

test('Vercel runs the locked root install and serves only the static output directory', async () => {
  const {framework, installCommand, buildCommand, outputDirectory} =
    JSON.parse(await fs.readFile(path.join(root,'vercel.json'), 'utf8'));
  assert.deepEqual({framework, installCommand, buildCommand, outputDirectory},
    {framework:null, installCommand:'npm ci', buildCommand:'npm run build', outputDirectory:'dist'});
});

test('a configured preview publishes exactly the website, SDK and two public configuration values', async t => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(),'researchtrail-preview-'));
  t.after(() => fs.rm(work,{recursive:true,force:true}));
  const tracked = await execFile('git',['ls-files','-z','--','web'],{cwd:root});
  const files = tracked.stdout.split('\0').filter(Boolean);
  assert.ok(files.includes('web/views/account-projects.html'));
  for (const name of [...files,'scripts/build-web.mjs','package.json']) {
    const target = path.join(work,name);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(root,name),target);
  }
  await fs.symlink(path.join(root,'node_modules'),path.join(work,'node_modules'),'junction');
  const canary = 'synthetic-unpublished-preview-marker';
  for (const name of ['notes.txt','web/js/unused.js','web/assets/papers/unlisted.pdf','web/assets/papers/.draft']) {
    await fs.writeFile(path.join(work,name),canary);
  }
  await fs.symlink(path.join(work,'notes.txt'),path.join(work,'web/styles/linked.css'));
  const publicConfig = {
    SUPABASE_URL:'https://preview.example.invalid',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_preview_fixture',
  };
  const build = () => execFile(process.execPath,['scripts/build-web.mjs'],{cwd:work,
    env:{...publicConfig,SERVER_ONLY_SETTING:canary}});
  await build();
  const dist = path.join(work,'dist');
  const audit = () => execFile(process.execPath,[path.join(root,'scripts/check-web-output.mjs'),dist]);
  t.diagnostic((await audit()).stdout.trim());
  const configFile = path.join(dist,'js/browser-config.js');
  const configScript = await fs.readFile(configFile,'utf8');
  assert.equal(configScript,'window.RESEARCHTRAIL_CONFIG = Object.freeze('+JSON.stringify(publicConfig,null,2)+');\n');
  const extra = path.join(dist,'unpublished.txt');
  await fs.writeFile(extra,canary);
  await assert.rejects(audit());
  await fs.unlink(extra);
  await fs.writeFile(configFile,configScript+'window.extra = "'+canary+'";\n');
  await assert.rejects(audit());
  await fs.writeFile(configFile,configScript);
  const asset = path.join(work,'web/views/reader.html');
  await fs.unlink(asset);
  await fs.symlink(path.join(work,'notes.txt'),asset);
  await assert.rejects(build());
  assert.ok((await fs.readFile(path.join(dist,'views/reader.html'))).equals(await fs.readFile(path.join(root,'web/views/reader.html'))));
});
