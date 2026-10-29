(() => {
  'use strict';

  const HOOK_MARKER = '__SPX_DV_REAL_RECEIVE_HOOK_V1__';
  const BRIDGE_READY = '__SPX_DV_REAL_RECEIVE_BRIDGE_READY_V1__';
  const BUFFER_KEY = '__SPX_DV_REAL_RECEIVE_BUFFER_V1__';
  const EVENT_NAME = 'spx-dv:real-receive-v1';
  const TARGET_PATH = '/api/in-station/uni_receive/order';

  if (window[HOOK_MARKER]) return;
  window[HOOK_MARKER] = true;

  function targetMeta(urlValue, methodValue) {
    try {
      const url = new URL(String(urlValue || ''), location.href);
      const method = String(methodValue || 'GET').toUpperCase();
      if (url.origin !== location.origin) return null;
      if (url.pathname !== TARGET_PATH) return null;
      if (method !== 'POST') return null;
      return { url: url.href, method };
    } catch {
      return null;
    }
  }

  function publish(meta, payload) {
    if (!meta || !payload || typeof payload !== 'object') return;

    const detail = {
      meta: {
        url: String(meta.url || ''),
        method: String(meta.method || 'POST').toUpperCase()
      },
      payload
    };

    if (!window[BRIDGE_READY]) {
      const buffer = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];
      buffer.push(detail);
      window[BUFFER_KEY] = buffer.slice(-30);
    }

    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    } catch {}
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET';
      const target = targetMeta(url, method);
      const promise = nativeFetch.apply(this, arguments);

      if (target) {
        promise.then(async response => {
          try {
            const clone = response.clone();
            const text = await clone.text();
            if (!text) return;
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {}
            publish(target, parsed);
          } catch {}
        });
      }

      return promise;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__spxDvReceiveHookMeta = targetMeta(url, method);
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    if (this.__spxDvReceiveHookMeta) {
      this.addEventListener('load', function() {
        try {
          let parsed = null;

          if (this.responseType === 'json') {
            parsed = this.response;
          } else if (!this.responseType || this.responseType === 'text') {
            const text = String(this.responseText || '');
            if (!text) return;
            try { parsed = JSON.parse(text); } catch {}
          }

          publish(this.__spxDvReceiveHookMeta, parsed);
        } catch {}
      }, { once: true });
    }

    return nativeSend.apply(this, arguments);
  };
})();
