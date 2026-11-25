'use strict';

// 화면 이동 시 즉시 사용할 수 있도록 앱 시작 전에 HTML을 한 번씩 읽는다.
const screens = {};

async function loadScreens() {
  await Promise.all(['landing', 'onboarding', 'main', 'reader'].map(async function (name) {
    const response = await fetch('views/' + name + '.html');
    if (!response.ok) throw new Error(name + '.html (' + response.status + ')');
    screens[name] = await response.text();
  }));
}

loadScreens().then(startResearchTrail, function (error) {
  console.error('화면을 불러오지 못했습니다.', error);
  app.textContent = '화면을 불러오지 못했어요. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '다시 시도';
  retry.addEventListener('click', function () { location.reload(); });
  app.appendChild(retry);
});
