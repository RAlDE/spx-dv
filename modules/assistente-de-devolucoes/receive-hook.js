(() => {
  'use strict';

  const HOOK_MARKER = '__SPX_DV_REAL_RECEIVE_HOOK_V1__';
  const BRIDGE_READY = '__SPX_DV_REAL_RECEIVE_BRIDGE_READY_V1__';
  const BUFFER_KEY = '__SPX_DV_REAL_RECEIVE_BUFFER_V1__';
  const DIAG_KEY = '__SPX_DV_REAL_RECEIVE_DIAG_V1__';
  const DIAG_STORAGE_KEY = 'spxdv:receive-hook-diag-v1';
  const EVENT_NAME = 'spx-dv:real-receive-v1';
  const TARGET_PATH = '/api/in-station/uni_receive/order';

  if (window[HOOK_MARKER]) return;
  window[HOOK_MARKER] = true;

  const diag = window[DIAG_KEY] && typeof window[DIAG_KEY] === 'object'
    ? window[DIAG_KEY]
    : {
        loaded_at: new Date().toISOString(),
        fetch_patched: false,
        xhr_patched: false,
        performance_observer: false,
        target_hits: 0,
        published: 0,
        posts: [],
        resources: []
      };
  window[DIAG_KEY] = diag;

  function persistDiag() {
    try {
      localStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(diag));
    } catch {}
  }

  function pushLimited(list, item, limit = 30) {
    list.unshift(item);
    if (list.length > limit) list.length = limit;
    persistDiag();
  }

  function serializeBody(body) {
    try {
      if (body == null) return '';
      if (typeof body === 'string') return body.slice(0, 12000);
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return body.toString().slice(0, 12000);
      }
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const obj = {};
        for (const [key, value] of body.entries()) {
          if (typeof value === 'string') obj[key] = value;
        }
        return JSON.stringify(obj).slice(0, 12000);
      }
      if (typeof body === 'object') return JSON.stringify(body).slice(0, 12000);
    } catch {}
    return '';
  }

  function requestBodyPromise(input, init) {
    const direct = serializeBody(init?.body);
    if (direct) return Promise.resolve(direct);

    try {
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return input.clone().text().then(text => String(text || '').slice(0, 12000)).catch(() => '');
      }
    } catch {}

    return Promise.resolve('');
  }

  function normalizePath(pathname) {
    return String(pathname || '').replace(/\/+$/, '') || '/';
  }

  function targetMeta(urlValue, methodValue) {
    try {
      const url = new URL(String(urlValue || ''), location.href);
      const method = String(methodValue || 'GET').toUpperCase();
      if (url.origin !== location.origin) return null;
      if (normalizePath(url.pathname) !== TARGET_PATH) return null;
      if (method !== 'POST') return null;
      return { url: url.href, method };
    } catch {
      return null;
    }
  }

  function recordPost(urlValue, methodValue, transport) {
    try {
      const method = String(methodValue || 'GET').toUpperCase();
      if (method !== 'POST') return;
      const url = new URL(String(urlValue || ''), location.href);
      if (url.origin !== location.origin) return;
      if (!/\/api\/in-station\//i.test(url.pathname)) return;

      pushLimited(diag.posts, {
        at: new Date().toISOString(),
        transport,
        path: url.pathname + url.search
      });
    } catch {}
  }

  // Passive diagnostic only. These observations never enter the receipt bridge.
  const SCAN_KEY = 'spxdv:scan-v1';
  let scan;
  try { scan = JSON.parse(localStorage.getItem(SCAN_KEY) || 'null'); } catch {}
  if (!scan || !Array.isArray(scan.entries)) scan = { entries: [], dropped: 0 };
  let scanTimer;
  function scanMeta(urlValue, method) {
    try {
      const u = new URL(String(urlValue || ''), location.href);
      if (u.origin !== location.origin) return null;
      if (!/^(?:\/api\/(?:fleet_order\/order\/detail\/(?:tracking_info|recipient_info|order_info)|in-station\/(?:uni_receive\/order|admin\/common_site\/eha\/(?:no_reason_inbound|resolve_reason)))|\/spx_delivery\/admin\/assignment\/assignment_task\/search\/v2)\/?$/.test(u.pathname)) return null;
      return { path: u.pathname + u.search, method: String(method).toUpperCase() };
    } catch { return null; }
  }
  function persistScan() {
    clearTimeout(scanTimer);
    try { localStorage.setItem(SCAN_KEY, JSON.stringify(scan)); }
    catch { scan.storage_error = 'Não foi possível salvar; exporte antes de fechar a página.'; }
  }
  window.__SPX_DV_SCAN_SNAPSHOT__ = () => scan;
  window.addEventListener('pagehide', persistScan);
  function observeScan(meta, body, response, status) {
    try {
      const raw = typeof response === 'string' ? response : JSON.stringify(response);
      const entry = { at: new Date().toISOString(), ...meta, http_status: status,
        request_body: String(body || ''), response_bytes: new Blob([raw || '']).size };
      if ((raw || '').length > 500000) entry.omitted = 'Resposta acima do limite de 500.000 caracteres';
      else { try { entry.response = JSON.parse(raw); } catch { entry.response_text = raw; } }
      scan.entries.push(entry);
      while (scan.entries.length > 40 || JSON.stringify(scan).length > 1500000) {
        scan.entries.shift(); scan.dropped++;
      }
      clearTimeout(scanTimer); scanTimer = setTimeout(persistScan, 300);
    } catch {}
  }

  function publish(meta, payload) {
    if (!meta || !payload || typeof payload !== 'object') return;

    diag.target_hits = Number(diag.target_hits || 0) + 1;
    diag.last_target = {
      at: new Date().toISOString(),
      path: (() => {
        try {
          const u = new URL(String(meta.url || ''), location.href);
          return u.pathname + u.search;
        } catch {
          return String(meta.url || '');
        }
      })(),
      method: String(meta.method || 'POST').toUpperCase(),
      retcode: payload?.retcode,
      order_count: Array.isArray(payload?.data?.order_list) ? payload.data.order_list.length : 0,
      has_body: Boolean(String(meta.body || '').trim())
    };

    const detail = {
      meta: {
        url: String(meta.url || ''),
        method: String(meta.method || 'POST').toUpperCase(),
        body: String(meta.body || '').slice(0, 12000),
        transport: String(meta.transport || '')
      },
      payload
    };

    if (!window[BRIDGE_READY]) {
      const buffer = Array.isArray(window[BUFFER_KEY]) ? window[BUFFER_KEY] : [];
      buffer.push(detail);
      window[BUFFER_KEY] = buffer.slice(-30);
    }

    diag.published = Number(diag.published || 0) + 1;
    persistDiag();

    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    } catch {}
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    diag.fetch_patched = true;
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET';
      recordPost(url, method, 'fetch');
      const diagnostic = scanMeta(url, method);
      const diagnosticBody = diagnostic ? requestBodyPromise(input, init) : null;
      const target = targetMeta(url, method);
      const bodyPromise = target ? requestBodyPromise(input, init) : null;
      const promise = nativeFetch.apply(this, arguments);

      if (diagnostic) promise.then(async response => {
        try { observeScan(diagnostic, await diagnosticBody, await response.clone().text(), response.status); } catch {}
      }, () => {});
      if (target) {
        promise.then(async response => {
          try {
            const [text, body] = await Promise.all([
              response.clone().text().catch(() => ''),
              bodyPromise || Promise.resolve('')
            ]);
            if (!text) return;
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {}
            publish({ ...target, body, transport: 'fetch' }, parsed);
          } catch {}
        });
      }

      return promise;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  diag.xhr_patched = true;

  XMLHttpRequest.prototype.open = function(method, url) {
    recordPost(url, method, 'xhr');
    this.__spxDvScanMeta = scanMeta(url, method);
    this.__spxDvReceiveHookMeta = targetMeta(url, method);
    return nativeOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this.__spxDvScanMeta) {
      const meta = this.__spxDvScanMeta, requestBody = serializeBody(body);
      this.addEventListener('load', function() {
        try { observeScan(meta, requestBody, this.responseType === 'json' ? this.response : this.responseText, this.status); } catch {}
      }, { once: true });
    }
    if (this.__spxDvReceiveHookMeta) {
      this.__spxDvReceiveHookMeta.body = serializeBody(body);
      this.__spxDvReceiveHookMeta.transport = 'xhr';

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

  try {
    if (typeof PerformanceObserver === 'function') {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const name = String(entry?.name || '');
          if (!/\/api\/in-station\//i.test(name)) continue;
          try {
            const u = new URL(name, location.href);
            pushLimited(diag.resources, {
              at: new Date().toISOString(),
              initiator: String(entry?.initiatorType || ''),
              path: u.pathname + u.search
            });
          } catch {}
        }
      });
      observer.observe({ type: 'resource', buffered: true });
      diag.performance_observer = true;
    }
  } catch {}

  persistDiag();
})();
