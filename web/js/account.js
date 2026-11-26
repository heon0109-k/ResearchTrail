'use strict';

(function startAccountPage() {
  // Preserve direct links to the embedded example, without creating an Auth session for it.
  if (new URLSearchParams(window.location.search).get('demo') === '1') {
    window.location.replace('browser.html?demo=1');
    return;
  }

  const byId = id => document.getElementById(id);
  const workspace = byId('authWorkspace');
  const identity = byId('authIdentity');
  const message = byId('authMessage');
  const login = byId('authLogin');
  const logout = byId('authLogout');
  const back = byId('authBack');
  let auth;
  let ready = false;
  let accountId = null;
  let generation = 0;
  let receivedChange = false;

  window.addEventListener('pageshow', event => {
    if (event.persisted) window.location.reload();
  });

  function closeLocal() {
    // Let the existing change handler finish the focused memo's local edit history.
    workspace.firstElementChild?.contentDocument?.activeElement?.blur();
    workspace.replaceChildren();
  }

  function showLocal(restoreView = false) {
    closeLocal();
    const frame = document.createElement('iframe');
    frame.title = '브라우저 전용 작업공간';
    frame.src = 'browser.html';
    if (restoreView) frame.name = 'rt-local-reload';
    workspace.appendChild(frame);
    byId('authHome').hidden = true;
    byId('authMode').textContent = '브라우저 전용';
    back.hidden = !accountId;
  }

  function showAccount() {
    // Removing the document also drops its reader, dialogs, timers and pending UI callbacks.
    closeLocal();
    byId('authHome').hidden = false;
    byId('authMode').textContent = '현재 계정';
    back.hidden = true;
  }

  function applySession(user) {
    const id = user?.id || null;
    identity.textContent = id ? (user.email || id) : '';
    identity.hidden = !id;
    if (ready && id === accountId) return;

    const first = !ready;
    ready = true;
    generation++;
    accountId = id;
    message.textContent = '';
    login.disabled = logout.disabled = false;
    login.hidden = !!id;
    logout.hidden = !id;
    if (id) showAccount();
    else showLocal(first && window.performance?.getEntriesByType('navigation')[0]?.type === 'reload');
  }

  byId('authOpenLocal').addEventListener('click', () => showLocal());
  back.addEventListener('click', showAccount);

  login.addEventListener('click', async () => {
    if (!auth) { window.location.reload(); return; }
    if (!ready || accountId || login.disabled) return;
    const started = generation;
    login.disabled = true;
    message.textContent = '';
    try {
      const { data, error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/', skipBrowserRedirect: true },
      });
      if (generation !== started) return;
      if (error || !data?.url) throw new Error();
      window.location.assign(data.url);
    } catch {
      if (generation !== started) return;
      login.disabled = false;
      message.textContent = 'Google 로그인을 시작하지 못했어요. 다시 시도해 주세요.';
    }
  });

  logout.addEventListener('click', async () => {
    if (!accountId || logout.disabled) return;
    const started = generation;
    logout.disabled = true;
    message.textContent = '';
    try {
      const { error } = await auth.signOut({ scope: 'local' });
      if (generation !== started) return;
      if (error) throw error;
      applySession(null);
    } catch {
      if (generation !== started) return;
      logout.disabled = false;
      message.textContent = '로그아웃하지 못했어요. 다시 시도해 주세요.';
    }
  });

  try {
    const config = window.RESEARCHTRAIL_CONFIG;
    auth = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }).auth;
    auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        receivedChange = true;
        applySession(event === 'SIGNED_OUT' ? null : session?.user);
      } else if (event === 'INITIAL_SESSION') {
        if (!receivedChange) applySession(session?.user);
      } else if (accountId && session?.user?.id === accountId) {
        applySession(session.user);
      }
    });
    // The SDK initializes once and reports callback errors separately from INITIAL_SESSION.
    const initFailed = () => {
      if (receivedChange || accountId) return;
      if (!ready) applySession(null);
      message.textContent = '로그인을 확인하지 못했어요. 다시 시도해 주세요.';
    };
    auth.initialize().then(({ error }) => { if (error) initFailed(); }, initFailed);
  } catch {
    auth = null;
    applySession(null);
    message.textContent = '계정 기능을 불러오지 못했어요. Google로 로그인을 눌러 다시 시도해 주세요.';
  }
})();
