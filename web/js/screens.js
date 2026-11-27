'use strict';

// 화면 이동 시 즉시 사용할 수 있도록 앱 시작 전에 HTML을 한 번씩 읽는다.
const screens = {};

async function loadScreens() {
  const names = S.source === 'account' ? ['main','reader','account-projects'] : ['landing', 'onboarding', 'main', 'reader'];
  await Promise.all(names.map(async function (name) {
    const response = await fetch('views/' + name + '.html', { cache: 'no-cache' });
    if (!response.ok) throw new Error(name + '.html (' + response.status + ')');
    screens[name] = await response.text();
  }));
}

const screensReady = loadScreens();
screensReady.then(startResearchTrail, function (error) {
  console.error('화면을 불러오지 못했습니다.', error);
  app.textContent = '화면을 불러오지 못했어요. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '다시 시도';
  retry.addEventListener('click', function () { (S.source === 'account' ? window.top : window).location.reload(); });
  app.appendChild(retry);
});
