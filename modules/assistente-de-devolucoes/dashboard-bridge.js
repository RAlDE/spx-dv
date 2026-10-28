(() => {
  'use strict';

  const REQUEST_SOURCE = 'spxdv-main';
  const RESPONSE_SOURCE = 'spxdv-extension-bridge';

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== REQUEST_SOURCE || !message.id) return;
    if (message.type !== 'dashboard-queue') return;

    chrome.runtime.sendMessage({
      type: 'SPX_DV_DASHBOARD_QUEUE',
      action: String(message.action || ''),
      payload: message.payload || {}
    }).then(response => {
      window.postMessage({
        source: RESPONSE_SOURCE,
        id: message.id,
        response: response || { ok: false, error: 'Sem resposta da extensão.' }
      }, '*');
    }).catch(error => {
      window.postMessage({
        source: RESPONSE_SOURCE,
        id: message.id,
        response: { ok: false, error: String(error?.message || error || 'Falha no bridge.') }
      }, '*');
    });
  });
})();
