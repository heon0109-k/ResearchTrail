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
  const openLocal = byId('authOpenLocal');
  const deviceTabKey = 'researchtrail.deviceView.' + window.RESEARCHTRAIL_CONFIG?.SUPABASE_URL;
  let auth;
  let ready = false;
  let accountId = null;
  let accessToken = null;
  let accountRequests;
  let generation = 0;
  let receivedChange = false;
  // The landing page's "use another account" link arrives as ?switch=1: sign this browser out, then open Google's account chooser.
  const query = new URLSearchParams(window.location.search);
  const callback = query.has('code') || query.has('error');
  let switching = !callback && query.get('switch') === '1';
  let startLogin = !callback && query.get('login') === '1';
  if (switching || startLogin) window.history?.replaceState(null, '', window.location.pathname);

  window.addEventListener('pageshow', event => {
    if (event.persisted) window.location.reload();
  });

  function closeWorkspace() {
    accountRequests?.abort();
    // Let the existing change handler finish the focused memo's local edit history.
    workspace.firstElementChild?.contentDocument?.activeElement?.blur();
    workspace.replaceChildren();
  }

  function rememberDeviceView(enabled) {
    try {
      if (enabled) window.sessionStorage.setItem(deviceTabKey, accountId);
      else window.sessionStorage.removeItem(deviceTabKey);
    } catch { /* Storage preferences are optional. */ }
  }

  function showLocal(restoreView = false) {
    closeWorkspace();
    const frame = document.createElement('iframe');
    frame.title = '이 브라우저에 저장하는 작업공간';
    frame.src = 'browser.html';
    if (restoreView) frame.name = 'rt-local-reload';
    else if (accountId) frame.name = 'rt-device';
    workspace.appendChild(frame);
    byId('authMode').textContent = '이 브라우저에만 저장';
    message.textContent = '';
    openLocal.hidden = true;
    back.textContent = '계정 타임라인으로';
    back.hidden = !accountId || !accessToken;
  }

  function accountUnavailable(text) {
    closeWorkspace();
    byId('authMode').textContent = '현재 계정';
    message.textContent = text;
    openLocal.hidden = false;
    back.textContent = '계정 타임라인 다시 열기';
    back.hidden = !accessToken;
  }

  function applySession(session) {
    const user = session?.user;
    const id = user?.id || null;
    const hadToken = !!accessToken;
    accessToken = id ? session.access_token : null;
    identity.textContent = id ? (user.email || id) : '';
    identity.hidden = !id;
    if (ready && id === accountId && hadToken === !!accessToken) return;

    const reload = !ready && window.performance?.getEntriesByType('navigation')[0]?.type === 'reload';
    let restoreDevice = false;
    try { restoreDevice = reload && !callback && id && window.sessionStorage.getItem(deviceTabKey) === id; } catch {}
    if (!restoreDevice) rememberDeviceView(false);
    ready = true;
    generation++;
    accountId = id;
    message.textContent = '';
    login.disabled = logout.disabled = false;
    login.hidden = !!id;
    logout.hidden = !id;
    const loginRequested = startLogin;
    startLogin = false;
    if (auth && (switching || (loginRequested && !id))) {
      if (id) accountUnavailable('다른 Google 계정으로 전환하는 중…');
      else showLocal();
      // Leave the SDK notification before making another Auth call.
      const started = generation;
      window.setTimeout(() => {
        if (generation !== started) return;
        if (id) logout.click();
        else login.click();
      }, 0);
      return;
    }
    if (!id || restoreDevice) showLocal(reload);
    else if (accessToken) showTimeline();
    else accountUnavailable('계정 연결을 확인하고 있어요. 계속 열리지 않으면 다시 로그인해 주세요.');
  }

  openLocal.addEventListener('click', () => {
    rememberDeviceView(true);
    showLocal();
  });
  function showTimeline() {
    if (!accountId || !accessToken) return;
    rememberDeviceView(false);
    closeWorkspace();
    const frame = document.createElement('iframe');
    const started = generation;
    frame.title = '계정 타임라인';
    frame.src = 'browser.html?workspace=account';
    frame.addEventListener('load', async () => {
      if (started !== generation || workspace.firstElementChild !== frame) return;
      accountRequests = new AbortController();
      const { signal } = accountRequests;
      const current = () => !signal.aborted && started === generation;
      const request = async (path, body, {pdf = false, artifactId, method = body ? 'POST' : 'GET'} = {}) => {
        if (!current()) throw new Error('계정이 변경되었어요.');
        const config = window.RESEARCHTRAIL_CONFIG;
        const result = await fetch(config.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/researchtrail' + path, {
          method, signal,
          headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken,
            'Content-Type': pdf ? 'application/pdf' : 'application/json',
            ...(pdf && body ? {'X-PDF-Name': encodeURIComponent(body.name)} : {}),
            ...(pdf && body && artifactId ? {'X-PDF-Artifact':artifactId} : {}) },
          body: pdf ? body : body ? JSON.stringify(body) : undefined,
        });
        const data = pdf && !body && result.ok ? await result.blob() : await result.json();
        if (!current()) throw new Error('계정이 변경되었어요.');
        if (!result.ok) {
          const error = new Error(data.error?.message || '계정 자료에 접근하지 못했어요.');
          error.code = data.error?.code;
          throw error;
        }
        return data;
      };
      const account = {accountId, projectUrl:window.RESEARCHTRAIL_CONFIG.SUPABASE_URL, current, write:request,
        listWorkspacePapers:taskId => request('/tasks/'+encodeURIComponent(taskId)+'/papers?view=workspace')};
      try {
        await frame.contentWindow.startAccountTimeline(path => request(path), account);
      } catch {
        if (current()) accountUnavailable('계정 타임라인을 열지 못했어요. 다시 시도해 주세요.');
      }
    }, { once: true });
    workspace.appendChild(frame);
    message.textContent = '';
    byId('authMode').textContent = '계정에 저장';
    openLocal.hidden = false;
    back.hidden = true;
  }
  back.addEventListener('click', showTimeline);

  login.addEventListener('click', async () => {
    if (!auth) { window.location.reload(); return; }
    if (!ready || accountId || login.disabled) return;
    const started = generation;
    login.disabled = true;
    message.textContent = '';
    try {
      const { data, error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/', skipBrowserRedirect: true,
          ...(switching ? { queryParams: { prompt: 'select_account' } } : {}) },
      });
      switching = false;
      if (generation !== started) return;
      if (error || !data?.url) throw new Error();
      window.location.assign(data.url);
    } catch {
      if (generation !== started) return;
      switching = false;
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
      if (switching) {
        switching = false;
        if (accessToken) showTimeline();
      }
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
        applySession(event === 'SIGNED_OUT' ? null : session);
      } else if (event === 'INITIAL_SESSION') {
        if (!receivedChange) applySession(session);
      } else if (accountId && session?.user?.id === accountId) {
        applySession(session);
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
