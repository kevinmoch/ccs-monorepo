// CCS Fetch Proxy — options page logic: manage the shell origin whitelist in storage.sync.
(() => {
  'use strict';

  const STORAGE_KEY = 'shellWhitelist';
  const DEFAULT_WHITELIST = self.CCS_DEFAULT_SHELL_WHITELIST;

  const textarea = document.getElementById('whitelist');
  const statusEl = document.getElementById('status');

  const showStatus = (text, isError = false) => {
    statusEl.textContent = text;
    statusEl.style.color = isError ? '#dc2626' : '#16a34a';
    if (text) setTimeout(() => (statusEl.textContent = ''), 2500);
  };

  const normalize = (lines) => [
    ...new Set(
      lines
        .split('\n')
        .map((line) => line.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    )
  ];

  const load = async () => {
    const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_WHITELIST });
    textarea.value = (stored[STORAGE_KEY] || []).join('\n');
  };

  document.getElementById('save').addEventListener('click', async () => {
    const origins = normalize(textarea.value);
    const invalid = origins.filter((origin) => !/^https?:\/\//.test(origin));
    if (invalid.length) {
      showStatus(`存在非法 origin（需以 http(s):// 开头）：${invalid[0]}`, true);
      return;
    }
    await chrome.storage.sync.set({ [STORAGE_KEY]: origins });
    textarea.value = origins.join('\n');
    showStatus('已保存');
  });

  document.getElementById('reset').addEventListener('click', async () => {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_WHITELIST });
    textarea.value = DEFAULT_WHITELIST.join('\n');
    showStatus('已恢复默认');
  });

  load();
})();
