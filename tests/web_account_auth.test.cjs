// Step 3. Exercise the configured entry point using synthetic Supabase Auth sessions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const execFile = require('node:util').promisify(require('node:child_process').execFile);

const root = path.resolve(__dirname, '..');
const config = { SUPABASE_URL: 'https://project.example.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
const ada = { user: { id: 'synthetic-a', email: 'ada@example.invalid' } };
const ben = { user: { id: 'synthetic-b', email: 'ben@example.invalid' } };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function element() {
  return {
    hidden: false, disabled: false, textContent: '', children: [],
    get firstElementChild() { return this.children[0]; },
    addEventListener(type, fn) { this[type] = fn; },
    replaceChildren(...children) { this.children = children; },
    appendChild(child) { this.children.push(child); },
  };
}

function openPage(sdk, { search = '?returnTo=https://other.invalid', navigationType = 'navigate' } = {}) {
  const template = fs.readFileSync(path.join(root, 'web/views/account.html'), 'utf8');
  const nodes = Object.fromEntries([...template.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element()]));
  const login = deferred(), logout = deferred(), initialized = deferred(), redirects = [], calls = [];
  const auth = {
    initialize: () => initialized.promise,
    onAuthStateChange(fn) { this.notify = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    signInWithOAuth(args) { calls.push(['login', args]); return login.promise; },
    signOut(args) { calls.push(['logout', args]); return logout.promise; },
  };
  const window = {
    addEventListener() {},
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    location: { origin: 'https://reader.example.invalid:8443', search,
      assign(url) { redirects.push(url); }, replace(url) { redirects.push(url); } },
    RESEARCHTRAIL_CONFIG: config,
    supabase: sdk || { createClient(url, key, options) { calls.push(['client', url, key, options]); return { auth }; } },
  };
  const document = { getElementById: id => nodes[id], createElement: () => element() };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/js/account.js'), 'utf8'), { window, document, URLSearchParams });
  const event = (type, session) => auth.notify(type, session);
  return { nodes, event, login, logout, initialized, redirects, calls };
}

test('the build enables Auth only at the configured root and gives the demo its own document', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'researchtrail-account-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  fs.mkdirSync(path.join(work, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/build-web.mjs'), path.join(work, 'scripts/build-web.mjs'));
  fs.cpSync(path.join(root, 'web'), path.join(work, 'web'), { recursive: true, filter: f =>
    !path.basename(f).startsWith('.') && path.basename(f) !== 'private' && !fs.lstatSync(f).isSymbolicLink() });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'junction');
  const build = env => execFile(process.execPath, ['scripts/build-web.mjs'], { cwd: work, env });
  const output = name => fs.readFileSync(path.join(work, 'dist', name), 'utf8');
  const original = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  await build(config);
  const entry = output('index.html');
  assert.deepEqual(Array.from(entry.matchAll(/<script src="([^"]+)"/g), m => m[1]),
    ['js/browser-config.js', 'vendor/supabase/supabase.js', 'js/account.js']);
  assert.equal(output('browser.html'), original);
  assert.match(output('views/landing.html'), /src="\?demo=1"/);
  await build({});
  assert.equal(output('index.html'), original);
  assert.ok(!fs.existsSync(path.join(work, 'dist/browser.html')));
});

test('Google OAuth uses only the current origin root and follows the SDK redirect', async () => {
  const { nodes, event, login, redirects, calls } = openPage();
  assert.equal(nodes.authWorkspace.children.length, 0);
  event('INITIAL_SESSION', null);
  assert.equal(nodes.authWorkspace.children[0].src, 'browser.html');
  assert.equal(nodes.authLogin.hidden, false);
  const pending = nodes.authLogin.click();
  assert.equal(nodes.authLogin.disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['client', config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, { auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    } }],
    ['login', { provider: 'google', options: { redirectTo: 'https://reader.example.invalid:8443/', skipBrowserRedirect: true } }],
  ]);
  login.resolve({ data: { url: 'https://project.example.invalid/auth/v1/authorize' }, error: null });
  await pending;
  assert.deepEqual(redirects, ['https://project.example.invalid/auth/v1/authorize']);
});

test('reload restores the account without opening local work; switching discards its open workspace', () => {
  const { nodes, event } = openPage();
  event('INITIAL_SESSION', ada);
  assert.equal(nodes.authIdentity.textContent, ada.user.email);
  assert.equal(nodes.authWorkspace.children.length, 0);
  nodes.authOpenLocal.click();
  const firstWorkspace = nodes.authWorkspace.children[0];
  let editCompletions = 0;
  firstWorkspace.contentDocument = { activeElement: { blur: () => editCompletions++ } };
  event('TOKEN_REFRESHED', ada);
  assert.equal(nodes.authWorkspace.children[0], firstWorkspace);
  event('SIGNED_IN', ben);
  assert.equal(editCompletions, 1);
  assert.equal(nodes.authWorkspace.children.length, 0);
  assert.equal(nodes.authIdentity.textContent, ben.user.email);
  event('TOKEN_REFRESHED', ada);
  event('USER_UPDATED', ada);
  assert.equal(nodes.authIdentity.textContent, ben.user.email);
  event('INITIAL_SESSION', ada);
  assert.equal(nodes.authIdentity.textContent, ben.user.email);
  event('USER_UPDATED', { user: { id: ben.user.id } });
  assert.equal(nodes.authIdentity.textContent, ben.user.id);
  event('SIGNED_OUT', null);
  assert.equal(nodes.authIdentity.textContent, '');
  assert.equal(nodes.authLogin.hidden, false);
  assert.notEqual(nodes.authWorkspace.children[0], firstWorkspace);
  const reloaded = openPage();
  reloaded.event('INITIAL_SESSION', ben);
  assert.equal(reloaded.nodes.authIdentity.textContent, ben.user.email);
});

test('sign-out is local; late responses from A cannot alter B, even after switching back to A', async () => {
  for (const response of [{ error: null }, { error: new Error('synthetic private detail') }]) {
    const { nodes, event, logout, calls } = openPage();
    event('INITIAL_SESSION', ada);
    const pending = nodes.authLogout.click();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['logout', { scope: 'local' }]);
    event('SIGNED_IN', ben);
    event('SIGNED_IN', ada);
    nodes.authOpenLocal.click();
    const current = nodes.authWorkspace.children[0];
    logout.resolve(response);
    await pending;
    assert.equal(nodes.authWorkspace.children[0], current);
    assert.equal(nodes.authIdentity.textContent, ada.user.email);
    assert.equal(nodes.authMessage.textContent, '');
    assert.equal(nodes.authLogout.disabled, false);
  }
});

test('a pending Google redirect cannot navigate away from a newer account', async () => {
  const { nodes, event, login, redirects } = openPage();
  event('INITIAL_SESSION', null);
  const pending = nodes.authLogin.click();
  event('SIGNED_IN', ben);
  login.resolve({ data: { url: 'https://project.example.invalid/old' }, error: null });
  await pending;
  assert.deepEqual(redirects, []);
  assert.equal(nodes.authIdentity.textContent, ben.user.email);
});

test('a direct example link bypasses Auth, and a signed-out reload restores the local view', () => {
  const example = openPage(null, { search: '?demo=1' });
  assert.deepEqual(example.calls, []);
  assert.deepEqual(example.redirects, ['browser.html?demo=1']);
  const guest = openPage(null, { navigationType: 'reload' });
  guest.event('INITIAL_SESSION', null);
  assert.equal(guest.nodes.authWorkspace.children[0].name, 'rt-local-reload');
});

test('a failed Google sign-in leaves the guest workspace open and the Korean retry control enabled', async () => {
  const { nodes, event, login, redirects } = openPage();
  event('INITIAL_SESSION', null);
  const frame = nodes.authWorkspace.children[0];
  const pending = nodes.authLogin.click();
  login.resolve({ data: {}, error: new Error('synthetic detail') });
  await pending;
  assert.equal(nodes.authWorkspace.children[0], frame);
  assert.equal(nodes.authLogin.disabled, false);
  assert.match(nodes.authMessage.textContent, /다시/);
  assert.doesNotMatch(nodes.authMessage.textContent, /synthetic/);
  assert.deepEqual(redirects, []);
});

test('sign-out success restores local mode; an error permits retry without exposing provider details', async () => {
  for (const succeeds of [false, true]) {
    const { nodes, event, logout } = openPage();
    event('INITIAL_SESSION', ada);
    const pending = nodes.authLogout.click();
    if (succeeds) logout.resolve({ error: null });
    else logout.reject(new Error('synthetic private detail'));
    await pending;
    assert.equal(nodes.authIdentity.textContent, succeeds ? '' : ada.user.email);
    assert.equal(nodes.authLogout.disabled, false);
    assert.equal(nodes.authMessage.textContent.includes('synthetic'), false);
    if (!succeeds) assert.match(nodes.authMessage.textContent, /다시/);
  }
});

test('the pinned SDK restores a synthetic stored session and signs out without touching research data', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const research = new Map([
    ['researchtrail.v5', JSON.stringify({ papers: [{ note: 'fixture', noteHistory: [{ content_text: 'draft' }],
      actionHistory: [{ original_candidate: 'candidate', final_action: 'confirmed' }] }] })],
    ['researchtrail.projects', JSON.stringify({ active: 'p0' })],
    ['researchtrail.action-draft.example.s2', 'synthetic example draft'],
  ]);
  const values = new Map(research);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const sessionKey = 'sb-project-auth-token';
  values.set(sessionKey, JSON.stringify({ ...ada, expires_at: Math.floor(Date.now() / 1000) + 3600,
    access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }));
  const requests = [];
  async function reload() {
    let client;
    const page = openPage({ createClient(url, key, options) {
      client = createClient(url, key, { ...options, auth: { ...options.auth, storage }, global: {
        fetch: async (url, init) => {
          requests.push([new URL(url).pathname, init.method, new URL(url).search]);
          return new Response(null, { status: 204 });
        },
      } });
      return client;
    } });
    // The app registered first. Wait for the real SDK's initial notification on this instance.
    const initial = deferred();
    const { data } = client.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION') initial.resolve();
    });
    await initial.promise;
    data.subscription.unsubscribe();
    return { page, close: () => client.auth.dispose() };
  }
  const first = await reload();
  assert.equal(first.page.nodes.authIdentity.textContent, ada.user.email);
  await first.close();
  const second = await reload();
  try {
    assert.equal(second.page.nodes.authIdentity.textContent, ada.user.email);
    assert.deepEqual(requests, []);
    await second.page.nodes.authLogout.click();
    assert.equal(second.page.nodes.authIdentity.textContent, '');
    assert.deepEqual(requests, [['/auth/v1/logout', 'POST', '?scope=local']]);
    assert.deepEqual(values, research);
    await second.page.nodes.authLogin.click();
    const consent = new URL(second.page.redirects[0]);
    assert.equal(consent.origin, config.SUPABASE_URL);
    assert.equal(consent.pathname, '/auth/v1/authorize');
    assert.equal(consent.searchParams.get('provider'), 'google');
    assert.equal(consent.searchParams.get('redirect_to'), 'https://reader.example.invalid:8443/');
    assert.equal(consent.searchParams.get('code_challenge_method'), 's256');
    assert.ok(consent.searchParams.get('code_challenge'));
    assert.equal(requests.length, 1);
  } finally { await second.close(); }
});
