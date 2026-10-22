(() => {
  'use strict';

  const APP_MARKER = 'spxdvAssistantActive';
  const MODULE_VERSION = '1.3.22';
  const PANEL_ID = 'spxdv-attempt-panel';
  const TOGGLE_ID = 'spxdv-attempt-toggle';
  const AUTOADD_ID = 'spxdv-autoadd-notice';
  const NOTICE_ID = 'spxdv-access-notice';
  const STYLE_ID = 'spxdv-assistant-style';
  const ROUTES = ['#/generalReceiveTaskMgt/singleReceiveNew/', '#/generalReceiveTaskOps/singleReceiveNew/'];
  const REQUIRED_ALIASES = ['RESOLVE_EO', 'CANCEL_EO_REASON'];
  const ADDRESS_REASON_ID = 'ER40';
  const ADDRESS_REASON_DESC = 'Onhold with Delivery Address Issue';
  const POSITION_KEY = 'spxdv:attempt-panel-position';
  const AUTOADD_OPERATOR = 'Admin(Polygon Auto Add)';
  const AUTOADD_RETRY_DELAYS = [0, 1200, 1800, 2500, 3200];
  const SHEET_WEBAPP_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbyYCiRSUK7r5kPeI19TFUkfgYr7WR2aCFCGMOJiZiY4rZPWu3j2eppuuMjK6pFAn_bS/exec';
  const ONHOLD_DATA_WEBAPP_URL = 'https://script.google.com/a/macros/shopee.com/s/AKfycbzVqz60x9ZBTt2dL83cxXaaHRMlqhEpU1r7AVlczQFmQSUdNGkyPUQcRsXzY17ImcbNOQ/exec';
  const RETURN_DIAG_KEY = 'spxdv:return-network-diag-v1';
  const ASSIGNMENT_SEARCH_URL = 'https://spx.shopee.com.br/spx_delivery/admin/assignment/assignment_task/search/v2';

  if (document.documentElement.dataset[APP_MARKER] === 'true') return;
  document.documentElement.dataset[APP_MARKER] = 'true';

  const translations = new Map([
    ['cannot find address', 'Endereço não encontrado'],
    ['disaster', 'Chuva forte / Desastres naturais'],
    ['do not deliver', 'Não entregar'],
    ['incorrect/ missing verification', 'Palavra-chave incorreta ou não informada'],
    ['incorrect/missing verification', 'Palavra-chave incorreta ou não informada'],
    ['insufficient time', 'Motorista não teve tempo de entregar'],
    ['insufficient vehicle capacity', 'Não coube no veículo'],
    ['office closed', 'Comércio fechado'],
    ['parcel damaged, cannot attempt', 'Item danificado'],
    ['parcel damaged', 'Item danificado'],
    ['damaged parcel', 'Item danificado'],
    ['parcel lost', 'Item perdido'],
    ['lost parcel', 'Item perdido'],
    ['recipient change location', 'Mudança de endereço'],
    ['recipient reject', 'Recusado por terceiros'],
    ['recipient unavailable for parcel', 'Ausente'],
    ['reject - buyers change their mind', 'Rejeitado pelo comprador'],
    ['risky area of delivery', 'Área de risco'],
    ['robbery/assault', 'Roubo/Assalto'],
    ['robbery attempt', 'Tentativa de roubo/assalto'],
    ['attempted robbery/assault', 'Tentativa de roubo/assalto'],
    ['theft', 'Roubo/Assalto'],
    ['unforeseen circumstances', 'Motorista desistiu da rota'],
    ['vehicle breakdown', 'Problemas Mecânicos'],
    ['wrongly assigned', 'Fora de Rota'],
    ['out of route', 'Fora de Rota'],
    ['out of the route', 'Fora de Rota'],
    ['driver gave up on the route', 'Motorista desistiu da rota'],
    ['app/internet failure', 'Problemas com internet/app'],
    ['address incorrect', 'Endereço incorreto'],
    ['incorrect address', 'Endereço incorreto'],
    ['incomplete address', 'Endereço incompleto'],
    ['customer unreachable', 'Não foi possível contatar o destinatário'],
    ['recipient unreachable', 'Não foi possível contatar o destinatário'],
    ['customer not at home', 'Destinatário ausente'],
    ['recipient not at home', 'Destinatário ausente'],
    ['customer refused', 'Recusado pelo destinatário'],
    ['recipient refused', 'Recusado pelo destinatário'],
    ['customer requested reschedule', 'Destinatário solicitou reagendamento'],
    ['delivery rescheduled', 'Entrega reagendada'],
    ['bad weather', 'Condições climáticas adversas'],
    ['traffic jam', 'Congestionamento'],
    ['road blocked', 'Via bloqueada'],
    ['no access to location', 'Sem acesso ao local'],
    ['accident', 'Acidente'],
    ['driver accident', 'Acidente com o motorista'],
    ['security issue', 'Problema de segurança'],
    ['cash on delivery issue', 'Problema no pagamento na entrega'],
    ['incorrect otp', 'Código de confirmação incorreto'],
    ['missing otp', 'Código de confirmação não informado']
  ]);
  const validReasons = new Set([
    'endereco nao encontrado',
    'palavra-chave incorreta ou nao informada',
    'comercio fechado',
    'recusado por terceiros',
    'ausente'
  ]);
  const finalReasons = new Set(['nao entregar', 'mudanca de endereco', 'rejeitado pelo comprador']);

  let currentShipment = '';
  let currentRequest = 0;
  let authorized = false;
  let monitor = null;
  let collapsed = false;
  let diagnosticView = false;
  let lastObservedUrl = location.href;
  let shipmentKeyListenerInstalled = false;
  const autoCancelledAddress = new Set();
  const assignmentAgencyCache = new Map();
  const CANCELLED_ADDRESS_KEY = 'spxdv:cancelled-address-v1';

  function readCancelledAddressState() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CANCELLED_ADDRESS_KEY) || '{}');
      const now = Date.now();
      const clean = {};
      for (const [shipmentId, timestamp] of Object.entries(raw || {})) {
        if (now - Number(timestamp || 0) < 30 * 60 * 1000) clean[shipmentId] = Number(timestamp);
      }
      sessionStorage.setItem(CANCELLED_ADDRESS_KEY, JSON.stringify(clean));
      return clean;
    } catch {
      return {};
    }
  }

  function markAddressCancelled(shipmentId) {
    if (!shipmentId) return;
    const state = readCancelledAddressState();
    state[shipmentId] = Date.now();
    try { sessionStorage.setItem(CANCELLED_ADDRESS_KEY, JSON.stringify(state)); } catch {}
  }

  function isAddressCancelled(shipmentId) {
    if (!shipmentId) return false;
    return Boolean(readCancelledAddressState()[shipmentId]);
  }

  function isTargetRoute() {
    return location.origin === 'https://spx.shopee.com.br' &&
      ROUTES.some(route => location.hash.startsWith(route) || location.hash === route.slice(0, -1));
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json, text/plain, */*', ...(options.headers || {}) },
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.retcode !== 0) throw new Error(data?.message || `Falha HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }


  function pageShipmentId() {
    return String(location.href).match(/BR[A-Z0-9]{8,}/i)?.[0]?.toUpperCase() || '';
  }

  function collectReturnDiagnosticHints(value, path = '', out = [], depth = 0) {
    if (!value || typeof value !== 'object' || depth > 14 || out.length >= 100) return out;

    for (const [key, child] of Object.entries(value)) {
      if (out.length >= 100) break;
      const nextPath = path ? path + '.' + key : key;

      if (child && typeof child === 'object') {
        collectReturnDiagnosticHints(child, nextPath, out, depth + 1);
        continue;
      }

      const nk = normalize(key);
      const sv = String(child ?? '');
      const nv = normalize(sv);

      if (
        /status|state|event|message|desc|description|title|reason|remark|time|date|created|updated|operator|staff|return|retorno|lmhub/.test(nk) ||
        /return_lmhub|retorno_lmhub|devolucao em espera|comercio fechado|retornando/.test(nv)
      ) {
        out.push({ path: nextPath, value: sv.slice(0, 260) });
      }
    }

    return out;
  }

  function diagnosticExcerpt(text) {
    const raw = String(text || '');
    const match = raw.match(/retorno[_\s-]*lmhub[_\s-]*em[_\s-]*espera|return[_\s-]*lmhub[_\s-]*(?:onhold|on[_\s-]*hold)|devolu[cç][aã]o\s+em\s+espera|com[eé]rcio\s+fechado|retorno[_\s-]*lmhub[_\s-]*retornando/i);
    if (!match) return '';
    const start = Math.max(0, Number(match.index || 0) - 220);
    const end = Math.min(raw.length, Number(match.index || 0) + 520);
    return raw.slice(start, end);
  }

  function saveReturnDiagnostic(meta, parsed, rawText) {
    try {
      const urlText = String(meta?.url || '');
      if (!urlText) return;

      const url = new URL(urlText, location.href);
      if (url.origin !== location.origin) return;
      if (!/\/api\//i.test(url.pathname)) return;

      const text = String(rawText || '');
      if (!text) return;

      const normalizedText = normalize(text);
      const pageBr = pageShipmentId();
      const activeBr = String(currentShipment || '').trim().toUpperCase();
      const requestBr = String(url.searchParams.get('shipment_id') || '').trim().toUpperCase();
      const shipment = requestBr || pageBr || activeBr;

      const hasReturnWait =
        /retorno[_\s-]*lmhub[_\s-]*em[_\s-]*espera/i.test(text) ||
        /return[_\s-]*lmhub[_\s-]*(?:onhold|on[_\s-]*hold)/i.test(text);
      const hasReturnReturning =
        /retorno[_\s-]*lmhub[_\s-]*retornando/i.test(text) ||
        /return[_\s-]*lmhub[_\s-]*returning/i.test(text);
      const hasWaitingMessage = /devolu[cç][aã]o\s+em\s+espera/i.test(text);
      const hasCommerce = /com[eé]rcio\s+fechado/i.test(text);
      const hasShipment = shipment ? text.toUpperCase().includes(shipment) : false;
      const isTrackingInfo = /tracking_info/i.test(urlText);

      // Guardamos respostas diretamente relacionadas ao BR, ao fluxo Return
      // ou o tracking_info que já está sendo investigado.
      if (!hasReturnWait && !hasReturnReturning && !hasWaitingMessage &&
          !hasCommerce && !hasShipment && !isTrackingInfo) return;

      const candidate = {
        capturedAt: new Date().toISOString(),
        pageBr,
        activeBr,
        requestBr,
        method: String(meta?.method || 'GET').toUpperCase(),
        url: urlText,
        size: text.length,
        hasReturnWait,
        hasReturnReturning,
        hasWaitingMessage,
        hasCommerce,
        hasShipment,
        isTrackingInfo,
        excerpt: diagnosticExcerpt(text),
        hints: parsed && typeof parsed === 'object'
          ? collectReturnDiagnosticHints(parsed).slice(0, 70)
          : []
      };

      let list = [];
      try {
        list = JSON.parse(localStorage.getItem(RETURN_DIAG_KEY) || '[]');
        if (!Array.isArray(list)) list = [];
      } catch {}

      const signature = candidate.method + '|' + candidate.url + '|' + (candidate.requestBr || candidate.pageBr || candidate.activeBr || '');
      list = list.filter(item =>
        (item.method + '|' + item.url + '|' + (item.requestBr || item.pageBr || item.activeBr || '')) !== signature
      );
      list.unshift(candidate);
      localStorage.setItem(RETURN_DIAG_KEY, JSON.stringify(list.slice(0, 30)));
    } catch {}
  }

  async function inspectReturnFetchResponse(response, meta) {
    try {
      const url = new URL(String(meta?.url || ''), location.href);
      if (url.origin !== location.origin || !/\/api\//i.test(url.pathname)) return;

      const clone = response.clone();
      const text = await clone.text();
      if (!text) return;

      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      saveReturnDiagnostic(meta, parsed, text);
    } catch {}
  }

  function installReturnNetworkDiagnostic() {
    if (window.__SPX_DV_RETURN_NETWORK_DIAG__) return;
    window.__SPX_DV_RETURN_NETWORK_DIAG__ = true;

    const originalFetch = window.fetch;
    window.fetch = function(input, init = {}) {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      const promise = originalFetch.apply(this, arguments);
      promise.then(response => inspectReturnFetchResponse(response, { url, method, body }));
      return promise;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this.__spxDvReturnDiagMeta = {
        method: String(method || 'GET'),
        url: String(url || ''),
        body: ''
      };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (this.__spxDvReturnDiagMeta && typeof body === 'string') {
        this.__spxDvReturnDiagMeta.body = body.slice(0, 4000);
      }

      this.addEventListener('load', function() {
        try {
          const meta = this.__spxDvReturnDiagMeta || {};
          const url = new URL(String(meta.url || ''), location.href);
          if (url.origin !== location.origin || !/\/api\//i.test(url.pathname)) return;

          let text = '';
          let parsed = null;

          if (this.responseType === 'json') {
            parsed = this.response;
            text = JSON.stringify(parsed);
          } else if (!this.responseType || this.responseType === 'text') {
            text = this.responseText || '';
            try { parsed = JSON.parse(text); } catch {}
          }

          if (text) saveReturnDiagnostic(meta, parsed, text);
        } catch {}
      });

      return originalSend.apply(this, arguments);
    };
  }

  function getReturnDiagnostics() {
    try {
      const raw = JSON.parse(localStorage.getItem(RETURN_DIAG_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function renderReturnDiagnostics() {
    const panel = document.getElementById(PANEL_ID);
    const body = panel?.querySelector('.body');
    if (!panel || !body) return;

    const shipmentId = String(panel.dataset.shipmentId || currentShipment || '').trim().toUpperCase();
    const all = getReturnDiagnostics();
    const relevant = all.filter(item => {
      const br = String(item.requestBr || item.pageBr || item.activeBr || '').toUpperCase();
      return !shipmentId || !br || br === shipmentId;
    });

    const rows = relevant.length
      ? relevant.slice(0, 12).map((item, index) => {
          let path = item.url || '';
          try {
            const u = new URL(path, location.href);
            path = u.pathname + u.search;
          } catch {}

          const flags = [
            item.hasReturnWait ? 'Return OnHold/Em Espera' : '',
            item.hasReturnReturning ? 'Return Returning/Retornando' : '',
            item.hasWaitingMessage ? 'Devolução em espera' : '',
            item.hasCommerce ? 'Comércio Fechado' : '',
            item.hasShipment ? 'BR encontrado' : '',
            item.isTrackingInfo ? 'tracking_info' : ''
          ].filter(Boolean).join(' · ') || 'sem palavra-chave';

          const hints = (item.hints || []).slice(0, 18).map(h =>
            '<div style="padding:2px 0;border-top:1px solid #292929"><b>' +
            escapeHtml(h.path) + '</b>: <span style="word-break:break-word">' +
            escapeHtml(h.value) + '</span></div>'
          ).join('');

          const excerpt = item.excerpt
            ? '<div style="margin-top:6px;padding:6px;background:#111827;border-radius:6px;word-break:break-word">' +
              escapeHtml(item.excerpt) + '</div>'
            : '';

          return '<details ' + (index === 0 ? 'open' : '') +
            ' style="margin-bottom:8px;border:1px solid #475569;border-radius:8px;background:#050505">' +
            '<summary style="cursor:pointer;padding:9px;font-size:12px;font-weight:900;color:#fdba74">#' +
            (index + 1) + ' ' + escapeHtml(item.method || 'GET') + ' · ' +
            escapeHtml(item.size || 0) + ' bytes</summary>' +
            '<div style="padding:8px;font-size:11px;line-height:1.45">' +
            '<div style="word-break:break-all"><b>Endpoint:</b> ' + escapeHtml(path) + '</div>' +
            '<div style="margin-top:4px"><b>BR da requisição:</b> ' + escapeHtml(item.requestBr || item.pageBr || item.activeBr || '—') + '</div>' +
            '<div style="margin-top:4px;color:#fbbf24"><b>Sinais:</b> ' + escapeHtml(flags) + '</div>' +
            excerpt +
            (hints ? '<div style="margin-top:6px">' + hints + '</div>' : '') +
            '</div></details>';
        }).join('')
      : '<div class="message">Nenhuma fonte de retorno capturada ainda.</div>';

    body.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">' +
      '<strong style="font-size:15px">DIAGNÓSTICO DO RETORNO</strong>' +
      '<button type="button" data-diag-back style="border:1px solid #fed7aa;border-radius:7px;background:#111827;color:#fff;padding:6px 9px;cursor:pointer">Voltar</button>' +
      '</div>' +
      '<div style="font-size:12px;color:#cbd5e1;margin-bottom:9px">BR: <b>' + escapeHtml(shipmentId || '—') +
      '</b> · v' + escapeHtml(MODULE_VERSION) + '</div>' +
      rows;
  }

  function cookie(name) {
    const prefix = `${name}=`;
    const item = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  async function postJson(url, body) {
    const headers = { app: 'FMS Portal', 'content-type': 'application/json;charset=UTF-8' };
    const csrf = cookie('csrftoken');
    const deviceId = cookie('spx-admin-device-id') || cookie('device-id');
    if (csrf) headers['x-csrftoken'] = csrf;
    if (deviceId) headers['device-id'] = deviceId;
    return fetchJson(url, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  async function validateAccess() {
    const root = 'https://spx.shopee.com.br/api/admin/basicserver/current_user/';
    try {
      const [basic, permissions, confirmation] = await Promise.all([
        fetchJson(`${root}basic_info`),
        fetchJson(`${root}user_permission_info`),
        fetchJson(`${root}basic_info`)
      ]);
      const email = String(basic?.data?.email || '').trim().toLowerCase();
      const aliases = new Set((permissions?.data?.perm_list || []).flatMap(item => Array.isArray(item?.perm_alias) ? item.perm_alias : []));
      const sameUser = basic?.data?.id === confirmation?.data?.id && basic?.data?.email === confirmation?.data?.email;
      authorized = sameUser && email.endsWith('@shopee.com') && REQUIRED_ALIASES.every(alias => aliases.has(alias));
      if (!authorized) showNotice('Acesso restrito: sua conta SPX precisa das permissões de resolver e cancelar ocorrências.');
      else document.getElementById(NOTICE_ID)?.remove();
    } catch {
      authorized = false;
      showNotice('Não foi possível validar sua conta. Entre no SPX e atualize a página.');
    }
  }

  function findInput() {
    return [...document.querySelectorAll('.ssc-input input[placeholder="Por favor, insira"]')]
      .find(input => !input.disabled && !input.readOnly && input.getBoundingClientRect().width > 0) || null;
  }

  function restoreTrackingFocus() {
    [0, 120, 350, 700, 1200].forEach(delay => {
      setTimeout(() => {
        const input = findInput();
        if (!input) return;
        try { input.focus({ preventScroll: true }); }
        catch { input.focus(); }
        input.select?.();
      }, delay);
    });
  }

  function showNotice(message) {
    let notice = document.getElementById(NOTICE_ID);
    if (!notice) {
      notice = document.createElement('div');
      notice.id = NOTICE_ID;
      document.body.appendChild(notice);
    }
    notice.textContent = message;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{position:fixed;z-index:2147483647;top:16px;left:16px;right:auto;width:min(520px,calc(100vw - 32px));max-height:82vh;overflow:hidden;border:1px solid #334155;border-radius:14px;background:#0f172a;color:#f8fafc;box-shadow:0 22px 62px #0008;font:15px Arial,sans-serif}
      #${PANEL_ID}[hidden]{display:none!important}#${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} header{position:relative;padding:15px 92px 13px 15px;border-bottom:1px solid #fb923c;background:linear-gradient(135deg,#ff6a00,#e94b00 68%,#9a3412);cursor:grab;user-select:none;touch-action:none}
      #${PANEL_ID}.dragging header{cursor:grabbing}#${PANEL_ID} h2{margin:0;font-size:19px;display:flex;align-items:baseline;gap:6px}#${PANEL_ID} .module-version{font-size:11px;font-weight:700;color:#fff;opacity:.78}#${PANEL_ID} header small{display:block;margin-top:7px;color:#fff;font-size:19px;font-weight:700}#${PANEL_ID} header small strong{font-size:inherit}#${PANEL_ID} .header-actions{position:absolute;top:9px;right:9px;display:flex;gap:6px}#${PANEL_ID} .icon-button{display:grid;place-items:center;width:32px;height:32px;border:1px solid #fed7aa;border-radius:8px;background:#111827;color:#fff;font-size:18px;cursor:pointer}
      #${PANEL_ID} .body{max-height:65vh;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto;padding:10px}#${PANEL_ID} .message{padding:22px;text-align:center;color:#cbd5e1}#${PANEL_ID} .error{color:#fca5a5}
      #${PANEL_ID} .attempt{display:grid;grid-template-columns:27px minmax(0,1fr) auto;gap:9px;margin-bottom:8px;padding:10px;border:1px solid #3f3f46;border-radius:10px;background:#050505}
      #${PANEL_ID} .index{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#334155;font-size:13px;font-weight:900}#${PANEL_ID} .reason{display:inline-block;padding:5px 10px;border-radius:999px;background:#16a34a33;color:#bbf7d0;font-size:19px;font-weight:800}#${PANEL_ID} .reason.reason-valid{background:#2563eb33;color:#bfdbfe}#${PANEL_ID} .reason.reason-final{background:#dc262633;color:#fecaca}#${PANEL_ID} .cancelled-badge{display:inline-block;margin-left:7px;padding:4px 8px;border-radius:999px;background:#64748b33;color:#e2e8f0;font-size:13px;font-weight:900;vertical-align:middle}
      #${PANEL_ID} .driver{margin-top:9px;color:#fff;font-size:19px;line-height:1.25}#${PANEL_ID} .driver .driver-code{color:#dbeafe}#${PANEL_ID} time{color:#fff;font-size:19px;font-weight:700;white-space:nowrap}#${PANEL_ID} img{width:58px;height:58px;margin-top:8px;border-radius:7px;object-fit:cover}
      #${PANEL_ID} .actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}#${PANEL_ID} .actions button{border:0;border-radius:8px;padding:10px;color:#fff;font-size:14px;font-weight:900;cursor:pointer}#${PANEL_ID} .confirm{background:#16a34a}#${PANEL_ID} .cancel{background:#dc2626}#${PANEL_ID} .result{grid-column:1/-1;color:#cbd5e1;font-size:12px}
      #${PANEL_ID} .decision{margin-top:10px;padding:12px;border:1px solid #22c55e66;border-radius:10px;background:#16a34a22;text-align:center}#${PANEL_ID} .decision.warn{border-color:#fb923c88;background:#9a341e33}#${PANEL_ID} .decision.stop{border-color:#ef444488;background:#7f1d1d44}#${PANEL_ID} .decision.address{border-color:#c084fc88;background:#6b21a844}#${PANEL_ID} .decision strong{font-size:16px}
      #${TOGGLE_ID}{position:fixed;z-index:2147483646;left:16px;bottom:18px;border:1px solid #fb923c;border-radius:999px;padding:11px 16px;background:#0f172a;color:#fff;box-shadow:0 12px 28px #0006;font:700 14px Arial,sans-serif;cursor:pointer}#${TOGGLE_ID}[hidden]{display:none!important}
      #${AUTOADD_ID}{position:fixed;z-index:2147483645;left:16px;bottom:72px;max-width:min(520px,calc(100vw - 32px));display:flex;align-items:center;gap:10px;padding:12px 15px;border:1px solid #22c55e88;border-radius:12px;background:#052e22;color:#dcfce7;box-shadow:0 12px 28px #0006;font:700 14px Arial,sans-serif}#${AUTOADD_ID}.next-cycle{border-color:#fb923c;background:#431407;color:#ffedd5}#${AUTOADD_ID} .icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#ffffff18;font-size:17px}
      #${NOTICE_ID}{position:fixed;right:16px;top:16px;z-index:2147483647;max-width:360px;padding:14px;border:1px solid #fb923c;border-radius:10px;background:#0f172a;color:#f8fafc;font:13px/1.5 Arial,sans-serif}
    `;
    document.documentElement.appendChild(style);
  }

  function showPanel(shipmentId, content) {
    ensureStyle();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.innerHTML = `<header><h2><span>Rastreio do pedido</span><span class="module-version">v${MODULE_VERSION}</span></h2><small>Shipment ID: <strong></strong></small><div class="header-actions"><button class="icon-button" data-diagnostic title="Diagnóstico">i</button><button class="icon-button" data-refresh title="Atualizar">↻</button><button class="icon-button" data-collapse title="Recolher">−</button></div></header><div class="body"></div>`;
      panel.addEventListener('click', handleAction);
      document.body.appendChild(panel);
      restorePanelPosition(panel);
      enablePanelDragging(panel);
      enablePanelScrolling(panel);
      ensureToggle();
    }
    panel.dataset.shipmentId = shipmentId;
    panel.querySelector('header strong').textContent = shipmentId;
    panel.querySelector('.body').innerHTML = content;
    setCollapsed(collapsed);
  }

  function ensureToggle() {
    let toggle = document.getElementById(TOGGLE_ID);
    if (toggle) return toggle;
    toggle = document.createElement('button');
    toggle.id = TOGGLE_ID;
    toggle.type = 'button';
    toggle.textContent = '▣ Devoluções';
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', String(!collapsed));
    toggle.addEventListener('click', () => setCollapsed(!collapsed));
    document.body.appendChild(toggle);
    return toggle;
  }

  function setCollapsed(value) {
    collapsed = value;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = collapsed;
    const toggle = ensureToggle();
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', String(!collapsed));
    toggle.title = collapsed ? 'Abrir a caixa de devoluções' : 'Fechar a caixa de devoluções';
  }

  function restorePanelPosition(panel) {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (!Number.isFinite(saved?.left) || !Number.isFinite(saved?.top)) return;
      const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      panel.style.left = `${Math.min(Math.max(8, saved.left), maxLeft)}px`;
      panel.style.top = `${Math.min(Math.max(8, saved.top), maxTop)}px`;
      panel.style.right = 'auto';
    } catch { /* Mantém a posição padrão à esquerda. */ }
  }

  function enablePanelDragging(panel) {
    const handle = panel.querySelector('header');
    let drag = null;

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      panel.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      const left = Math.min(Math.max(8, event.clientX - drag.offsetX), maxLeft);
      const top = Math.min(Math.max(8, event.clientY - drag.offsetY), maxTop);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
    });

    const finishDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      panel.classList.remove('dragging');
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(POSITION_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
    };

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  function enablePanelScrolling(panel) {
    const body = panel.querySelector('.body');
    if (!body || panel.dataset.scrollGuard === '1') return;
    panel.dataset.scrollGuard = '1';

    const scrollBody = event => {
      if (body.scrollHeight <= body.clientHeight) return false;
      body.scrollTop += event.deltaY;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return true;
    };

    body.addEventListener('wheel', scrollBody, { passive: false });

    // Algumas janelas do SPX colocam uma máscara sobre a página e capturam
    // a roda do mouse. No capture, usamos a posição do ponteiro para manter
    // a rolagem da nossa caixa funcionando sem criar outra barra.
    window.addEventListener('wheel', event => {
      if (panel.hidden || body.scrollHeight <= body.clientHeight) return;
      const rect = body.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (inside) scrollBody(event);
    }, { passive: false, capture: true });
  }

  function formatDate(timestamp) {
    if (!Number(timestamp)) return '-';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(Number(timestamp) * 1000));
  }

  function translateReason(reason) {
    const raw = String(reason || '').trim();
    if (!raw) return 'Motivo não informado';
    const match = raw.match(/^(\[[^\]]+\]\s*)?(.*)$/);
    const description = String(match?.[2] || raw).trim();
    const translated = translations.get(normalize(description));
    return translated || description;
  }

  function photoUrl(attempt) {
    const image = Array.isArray(attempt?.image_list) ? attempt.image_list.find(item => item?.image_url)?.image_url : '';
    const photo = Array.isArray(attempt?.photo_list) ? attempt.photo_list.find(Boolean) : '';
    const value = String(image || photo || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `https://spx.shopee.com.br/shopee-live-spx-perm-data/${value.replace(/^\/+/, '')}`;
  }

  function getDriverId(attempt) {
    const candidates = [
      attempt?.driver_id,
      attempt?.driver_uid,
      attempt?.driver_user_id,
      attempt?.driver_staff_id,
      attempt?.driver_account_id,
      attempt?.driver?.id,
      attempt?.driver?.driver_id,
      attempt?.driver_info?.id,
      attempt?.driver_info?.driver_id
    ];
    return String(candidates.find(value => value !== undefined && value !== null && String(value).trim()) || 'Não informado');
  }

  function getAddressState(data) {
    const reason = data?.data?.reason || {};
    const list = Array.isArray(data?.data?.eo_info?.reason_list) ? data.data.eo_info.reason_list : [];
    const active = list.find(item => Number(item?.reason_status) === 1);
    if (active?.reason_desc === ADDRESS_REASON_DESC && active?.follow_up_function === 'Confirm') {
      return { pending: true, reasonId: active.reason_id || reason.reason_id || ADDRESS_REASON_ID, localLang: active.local_lang || reason.local_lang || '' };
    }
    return { pending: false };
  }

  function attemptDay(timestamp) {
    if (!Number(timestamp)) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(Number(timestamp) * 1000));
  }

  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function collectTrackingNodes(nodes, output = []) {
    if (!Array.isArray(nodes)) return output;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      output.push(node);
      collectTrackingNodes(node.children, output);
      collectTrackingNodes(node.event_children, output);
    }
    return output;
  }

  function parseReturnTimestamp(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'object') {
      return parseReturnTimestamp(value?.seconds ?? value?.timestamp ?? value?.time);
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
  }

  function returnEventTimestamp(node) {
    const candidates = [
      node?.timestamp, node?.ctime, node?.event_time, node?.create_time,
      node?.created_at, node?.created_time, node?.event_timestamp,
      node?.update_time, node?.time, node?.date, node?.datetime
    ];

    for (const value of candidates) {
      const timestamp = parseReturnTimestamp(value);
      if (timestamp >= 1577836800 && timestamp <= 4102444800) return timestamp;
    }

    // Mesmo princípio que validamos no SPX OnHold: se o nome do campo variar,
    // varremos as chaves de tempo do próprio objeto em vez de depender de um nome fixo.
    for (const [key, value] of Object.entries(node || {})) {
      const nk = normalize(key);
      if (!/timestamp|ctime|event.*time|create.*time|created|updated|date|datetime|occurred/.test(nk)) continue;
      if (value && typeof value === 'object') continue;
      const timestamp = parseReturnTimestamp(value);
      if (timestamp >= 1577836800 && timestamp <= 4102444800) return timestamp;
    }

    return 0;
  }

  function collectAllObjects(value, output = [], seen = new WeakSet(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 16 || seen.has(value)) return output;
    seen.add(value);
    if (!Array.isArray(value)) output.push(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') collectAllObjects(child, output, seen, depth + 1);
    }
    return output;
  }

  function trackingStatusText(value) {
    return normalize(value).replace(/[\s-]+/g, '_').replace(/_+/g, '_');
  }

  function primitiveEntries(node) {
    return Object.entries(node || {}).filter(([, value]) =>
      value !== null && value !== undefined && !(value && typeof value === 'object')
    );
  }

  function nodeIsReturnOnhold(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

    const entries = primitiveEntries(node);

    // NÃO usar código numérico isolado. O teste real mostrou que o mesmo status
    // pode aparecer associado a eventos que não são Return OnHold.
    //
    // O sinal operacional confiável é o próprio evento:
    // "Devolução em espera: [motivo]" / on_hold_reason,
    // ou o nome textual Return_LMHub_Onhold / Retorno_LMHub_Em_Espera.
    const hasExplicitReturnStatus = entries.some(([, value]) => {
      const text = trackingStatusText(value);
      return text.includes('return_lmhub_onhold') ||
        text.includes('return_lmhub_on_hold') ||
        text.includes('retorno_lmhub_em_espera');
    });

    if (hasExplicitReturnStatus) return true;

    const messageText = [
      node?.message, node?.description, node?.title, node?.remark
    ].filter(Boolean).join(' ');

    if (/devolu[cç][aã]o\s+em\s+espera\s*:/i.test(messageText)) return true;

    // Se a estrutura trouxer motivo de OnHold junto com linguagem explícita de
    // devolução/retorno no mesmo objeto, também é uma ocorrência Return válida.
    const directReason = String(node?.on_hold_reason || node?.reason_desc || '').trim();
    const objectText = entries.map(([, value]) => String(value)).join(' ');
    return Boolean(directReason) && /devolu[cç][aã]o|retorno|return/i.test(objectText);
  }

  function returnOccurrenceReason(node) {
    // No tracking_info real, o motivo já vem limpo em on_hold_reason.
    // Ex.: status 128 + on_hold_reason: "Comércio Fechado".
    const direct = String(node?.on_hold_reason || node?.reason_desc || '').trim();
    if (direct) return direct;

    const entries = primitiveEntries(node);

    // Fallback pela mensagem:
    // Devolução em espera: [Comércio Fechado]
    const preferred = entries
      .filter(([key, value]) =>
        /message|desc|description|remark|reason|title|content|detail/.test(normalize(key)) ||
        /devolucao\s+em\s+espera|on\s*hold/i.test(normalize(value))
      )
      .map(([, value]) => String(value));

    const all = entries.map(([, value]) => String(value));
    for (const text of [...preferred, ...all]) {
      const exact =
        text.match(/devolu[cç][aã]o\s+em\s+espera\s*:\s*\[([^\]]+)\]/i)?.[1] ||
        text.match(/(?:return|retorno).*?(?:on\s*hold|em\s+espera)\s*:\s*\[([^\]]+)\]/i)?.[1] ||
        text.match(/(?:em\s+espera|on\s*hold)\s*[:\-]\s*\[?([^\]\n]+)\]?/i)?.[1];
      if (exact) return String(exact).trim();
    }
    return '';
  }

  function returnOccurrenceOperator(node) {
    return String(
      node?.operator || node?.biz_staff_name || node?.operator_name ||
      node?.staff_name || node?.operatorName || ''
    ).trim();
  }

  function extractReturnOccurrences(tracking) {
    const matches = collectAllObjects(tracking).map((node, index) => {
      if (!nodeIsReturnOnhold(node)) return null;
      const stamp = returnEventTimestamp(node);
      if (!stamp) return null;

      return {
        ctime: stamp,
        on_hold_reason__desc: returnOccurrenceReason(node) || 'Retorno LMHub em espera',
        return_occurrence: true,
        current_return: false,
        return_operator: returnOccurrenceOperator(node),
        index
      };
    }).filter(Boolean)
      .sort((a, b) => Number(a.ctime) - Number(b.ctime) || a.index - b.index);

    // Evita duplicidade caso o mesmo evento apareça repetido em estruturas internas.
    const unique = [];
    const seen = new Set();
    for (const item of matches) {
      const key = String(item.ctime) + '|' + normalize(item.on_hold_reason__desc);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    if (unique.length) unique[unique.length - 1].current_return = true;
    return unique;
  }

  function returnCycleStartTimestamp(tracking) {
    const occurrences = extractReturnOccurrences(tracking);
    return occurrences.length ? Number(occurrences[0].ctime || 0) : 0;
  }

  function assignmentTaskId(message) {
    const text = String(message || '');
    if (!/Assignment Task/i.test(text)) return '';
    return String(text.match(/\[(AT[^\]\s]+)\]/i)?.[1] || '').trim();
  }

  function trackingDriverIdentity(node) {
    const operator = String(node?.operator || '').trim();
    const operatorMatch = operator.match(/^\s*\[([^\]]+)\]\s*(.+?)\s*$/);
    if (operatorMatch) {
      return { id: String(operatorMatch[1] || '').trim(), name: String(operatorMatch[2] || '').trim() };
    }

    const message = String(node?.message || '').trim();
    const messageMatch = message.match(/Motorista\s*:\s*\[([^\]]+)\]\s*([^;]+)/i);
    if (messageMatch) {
      return { id: String(messageMatch[1] || '').trim(), name: String(messageMatch[2] || '').trim() };
    }

    return { id: '', name: '' };
  }

  function nodeRepresentsDelivering(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    if (String(node?.status ?? '').trim() === '2') return true;

    return primitiveEntries(node).some(([key, value]) => {
      const nk = normalize(key);
      if (!/status|state/.test(nk)) return false;
      return trackingStatusText(value) === 'delivering';
    });
  }

  function extractAssignmentDeliveryCycles(tracking) {
    const events = collectAllObjects(tracking)
      .map((node, index) => ({
        node,
        index,
        ctime: returnEventTimestamp(node)
      }))
      .filter(item => item.ctime)
      .sort((a, b) => Number(a.ctime) - Number(b.ctime) || a.index - b.index);

    let currentAssignmentId = '';
    const cycles = [];

    for (const event of events) {
      const at = assignmentTaskId(event.node?.message);
      if (at) currentAssignmentId = at;

      if (!currentAssignmentId || !nodeRepresentsDelivering(event.node)) continue;

      const driver = trackingDriverIdentity(event.node);
      cycles.push({
        assignmentId: currentAssignmentId,
        ctime: Number(event.ctime),
        driverId: driver.id,
        driverName: driver.name
      });
    }

    return cycles;
  }

  function assignmentCycleForAttempt(attempt, cycles) {
    const attemptTime = Number(attempt?.ctime || 0);
    if (!attemptTime || !cycles.length) return null;

    const beforeAttempt = cycles.filter(item => Number(item.ctime || 0) <= attemptTime);
    if (!beforeAttempt.length) return null;

    const attemptDriverId = getDriverId(attempt);
    const hasDriverId = attemptDriverId && attemptDriverId !== 'Não informado';
    if (hasDriverId) {
      const sameDriver = beforeAttempt.filter(item =>
        String(item.driverId || '').trim() === String(attemptDriverId).trim()
      );
      if (sameDriver.length) return sameDriver[sameDriver.length - 1];
    }

    return beforeAttempt[beforeAttempt.length - 1];
  }

  async function fetchAssignmentAgency(assignmentId) {
    const key = String(assignmentId || '').trim().toUpperCase();
    if (!key) return null;
    if (assignmentAgencyCache.has(key)) return assignmentAgencyCache.get(key);

    try {
      const response = await fetchJson(ASSIGNMENT_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({
          assignment_task_id: key,
          pageno: 1,
          count: 20,
          search_type: 0
        })
      });

      const list = Array.isArray(response?.data?.list) ? response.data.list : [];
      const item = list.find(row =>
        String(row?.assignment_task_id || '').trim().toUpperCase() === key
      ) || list[0] || null;

      if (!item) return null;

      const result = {
        assignmentId: String(item?.assignment_task_id || key).trim(),
        agency: String(item?.agency || '').trim(),
        agencyId: String(item?.agency_id ?? '').trim(),
        driverId: String(item?.driver_id ?? '').trim(),
        driverName: String(item?.driver_name || '').trim()
      };

      assignmentAgencyCache.set(key, result);
      return result;
    } catch (error) {
      console.warn('[SPX-DV] Falha ao consultar Agência (3PL) da AT', key, error);
      return null;
    }
  }

  async function enrichAttemptsWithAssignmentAgency(attempts, tracking, version) {
    if (!Array.isArray(attempts) || !attempts.length || !tracking) return attempts || [];

    const cycles = extractAssignmentDeliveryCycles(tracking);
    if (!cycles.length) return attempts;

    const linked = attempts.map(attempt => {
      const cycle = assignmentCycleForAttempt(attempt, cycles);
      if (!cycle) return attempt;
      return {
        ...attempt,
        assignment_task_id: cycle.assignmentId,
        assignment_driver_id: cycle.driverId,
        assignment_driver_name: cycle.driverName
      };
    });

    const assignmentIds = [...new Set(linked
      .map(item => String(item?.assignment_task_id || '').trim().toUpperCase())
      .filter(Boolean))];

    if (!assignmentIds.length) return linked;

    const results = await Promise.all(assignmentIds.map(async assignmentId => [
      assignmentId,
      await fetchAssignmentAgency(assignmentId)
    ]));

    if (version !== currentRequest) return linked;

    const byAssignment = new Map(results);
    return linked.map(attempt => {
      const assignmentId = String(attempt?.assignment_task_id || '').trim().toUpperCase();
      const details = byAssignment.get(assignmentId);
      if (!details) return attempt;

      const attemptDriverId = getDriverId(attempt);
      const knownAttemptDriver = attemptDriverId && attemptDriverId !== 'Não informado';
      const agencyDriverId = String(details.driverId || '').trim();

      // A AT deve apontar para o mesmo motorista da ocorrência. Se ambos os IDs
      // estiverem disponíveis e forem diferentes, não mostramos uma 3PL incorreta.
      if (knownAttemptDriver && agencyDriverId && String(attemptDriverId).trim() !== agencyDriverId) {
        return { ...attempt, assignment_agency_mismatch: true };
      }

      return {
        ...attempt,
        assignment_agency: details.agency,
        assignment_agency_id: details.agencyId,
        assignment_driver_lookup_name: details.driverName
      };
    });
  }

  function nodeIsAnyOnhold(node) {
    if (!node || typeof node !== 'object') return false;
    if (String(node?.status ?? '').trim() === '5') return true;
    if (nodeIsReturnOnhold(node)) return true;

    const text = [
      node?.message, node?.description, node?.title, node?.remark
    ].filter(Boolean).join(' ');

    return /pedido\s+em\s+espera\s*:/i.test(text) ||
      /on\s*hold/i.test(text) && Boolean(String(node?.on_hold_reason || '').trim());
  }

  function trackingEventsChronological(tracking) {
    const nodes = collectTrackingNodes(tracking?.data?.tracking_list);
    const seen = new Set();

    return nodes.map((node, index) => ({
      node,
      index,
      ctime: returnEventTimestamp(node)
    }))
      .filter(item => item.ctime)
      .filter(item => {
        const key = String(item.node?.id || '') + '|' +
          String(item.ctime) + '|' + String(item.node?.status ?? '') + '|' +
          String(item.node?.message || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(a.ctime) - Number(b.ctime) || a.index - b.index);
  }

  function nodeEndsPendingOnhold(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    if (nodeIsAnyOnhold(node)) return false;

    // Uma nova saída em rota encerra a ocorrência anterior.
    if (nodeRepresentsDelivering(node)) return true;

    const entries = primitiveEntries(node);
    const statusTexts = entries.map(([, value]) => trackingStatusText(value));
    const messageText = [
      node?.message, node?.description, node?.title, node?.remark
    ].filter(Boolean).join(' ');
    const normalizedMessage = normalize(messageText);

    // Entregue.
    if (String(node?.status ?? '').trim() === '4') return true;
    if (statusTexts.some(text => text === 'delivered' || text.endsWith('_delivered'))) return true;
    if (/pedido\s+entregue|entrega\s+concluida/.test(normalizedMessage)) return true;

    // Retorno saiu do OnHold e passou a retornar.
    if (statusTexts.some(text =>
      text.includes('return_lmhub_returning') ||
      text.includes('retorno_lmhub_retornando')
    )) return true;
    if (/devolucao\s+em\s+retorno|retorno.*retornando/.test(normalizedMessage)) return true;

    // Entrada/recebimento efetivo no LMHub também encerra o OnHold anterior.
    // Não basta a palavra LMHub isolada: exigimos linguagem operacional de
    // recebimento/entrada para não confundir eventos informativos.
    if (
      /lmhub/.test(normalizedMessage) &&
      /recebid|entrada|inbound|recepcao/.test(normalizedMessage)
    ) return true;

    return false;
  }

  function occurrenceIsReceivableNow(attempt, tracking, scanUnix) {
    const occurrenceTime = Number(attempt?.ctime || 0);
    if (!occurrenceTime) return false;

    const events = trackingEventsChronological(tracking);

    // Antes, qualquer evento posterior ao OnHold bloqueava o envio. Isso gerou
    // falso negativo em BRs válidos porque o tracking contém eventos meramente
    // informativos (AT, auditoria, endereço etc.). Agora só uma mudança REAL do
    // ciclo encerra a ocorrência pendente.
    const firstLaterState = events.find(item =>
      Number(item.ctime) > occurrenceTime && nodeEndsPendingOnhold(item.node)
    );

    if (!firstLaterState) return true;

    // Se a própria leitura no Recebimento acabou de gerar a mudança de estado,
    // ainda é a ocorrência que está sendo recebida agora.
    const scannedAt = Number(scanUnix || 0);
    return scannedAt > 0 && Math.abs(Number(firstLaterState.ctime) - scannedAt) <= 300;
  }

  async function fetchOccurrenceNeighborhood(shipmentId, returnFlow) {
    const dataField = returnFlow ? 'seller_addr_district' : 'buyer_addr_district';
    const url = 'https://spx.shopee.com.br/api/fleet_order/order/detail/show_sensitive_data' +
      '?shipment_id=' + encodeURIComponent(shipmentId) +
      '&data_field=' + encodeURIComponent(dataField);

    const response = await fetchJson(url);
    return String(response?.data?.data_detail || '').trim();
  }

  function currentOccurrenceSheetPayload(shipmentId, attempt, returnFlow, neighborhood) {
    const reason = translateReason(attempt?.on_hold_reason__desc);
    const normalAttempt = !attempt?.return_occurrence;
    const rawDriverId = normalAttempt ? getDriverId(attempt) : '';
    const driverId = rawDriverId === 'Não informado' ? '' : rawDriverId;

    return {
      shipment_id: String(shipmentId || '').trim().toUpperCase(),
      reason: String(reason || '').trim(),
      driver_id: String(driverId || '').trim(),
      driver_name: normalAttempt ? String(attempt?.driver_name || '').trim() : '',
      agency: normalAttempt ? String(attempt?.assignment_agency || '').trim() : '',
      neighborhood: String(neighborhood || '').trim(),
      occurrence_timestamp: Number(attempt?.ctime || 0),
      flow: returnFlow ? 'Return_LMHub' : 'LMHub'
    };
  }

  async function sendCurrentOccurrenceToDataSheet(shipmentId, attempt, tracking, returnFlow, scanUnix, version) {
    if (!shipmentId || !attempt || !ONHOLD_DATA_WEBAPP_URL) return false;
    if (!occurrenceIsReceivableNow(attempt, tracking, scanUnix)) return false;

    let neighborhood = '';
    try {
      neighborhood = await fetchOccurrenceNeighborhood(shipmentId, returnFlow);
    } catch (error) {
      console.warn('[SPX-DV] Não foi possível obter o bairro da ocorrência', error);
    }

    if (version !== currentRequest || shipmentId !== currentShipment) return false;

    const payload = currentOccurrenceSheetPayload(
      shipmentId, attempt, returnFlow, neighborhood
    );

    if (!payload.occurrence_timestamp || !payload.reason) return false;

    try {
      await fetch(ONHOLD_DATA_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        keepalive: true
      });
      return true;
    } catch (error) {
      console.warn('[SPX-DV] Falha ao enviar ocorrência atual para a aba Dados', error);
      return false;
    }
  }

  function findRecentAutoAddTarget(tracking, scanUnix) {
    const lowerBound = Number(scanUnix) - 30;
    const upperBound = Number(scanUnix) + 14400;
    return collectTrackingNodes(tracking?.data?.tracking_list)
      .map((node, index) => ({ node, index, targetId: assignmentTaskId(node.message) }))
      .filter(item => {
        const operator = String(item.node.operator || '').trim();
        const staffName = String(item.node.biz_staff_name || '').trim();
        const timestamp = Number(item.node.timestamp || 0);
        return item.targetId && (operator === AUTOADD_OPERATOR || staffName === AUTOADD_OPERATOR) && timestamp >= lowerBound && timestamp <= upperBound;
      })
      .sort((a, b) => Number(b.node.timestamp || 0) - Number(a.node.timestamp || 0) || b.index - a.index)[0]?.targetId || '';
  }

  function todayRange() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const start = Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 3) / 1000);
    return { start, end: start + 86399 };
  }

  async function findAutoAddTargetId(shipmentId, scanUnix, version) {
    for (const delay of AUTOADD_RETRY_DELAYS) {
      if (delay) await sleep(delay);
      if (version !== currentRequest || shipmentId !== currentShipment) return '';
      try {
        const tracking = await fetchJson(`https://spx.shopee.com.br/api/fleet_order/order/detail/tracking_info?shipment_id=${encodeURIComponent(shipmentId)}`);
        const targetId = findRecentAutoAddTarget(tracking, scanUnix);
        if (targetId) return targetId;
      } catch { /* Nova tentativa enquanto o SPX finaliza o registro. */ }
    }
    return '';
  }

  async function loadAuditTasks(range, version) {
    const tasks = [];
    const ids = new Set();
    for (let page = 1; page <= 10; page += 1) {
      if (version !== currentRequest) return [];
      const response = await fetchJson(`https://spx.shopee.com.br/api/in-station/lmhub/audit/task/list?page_no=${page}&count=100&validation_start_time=${range.start}&validation_end_time=${range.end}`);
      const list = Array.isArray(response?.data?.list) ? response.data.list : [];
      for (const task of list) {
        if (!task?.validation_task_id || ids.has(task.validation_task_id)) continue;
        ids.add(task.validation_task_id);
        tasks.push(task);
      }
      const total = Number(response?.data?.total ?? response?.data?.total_count);
      if (!list.length || list.length < 100 || (Number.isFinite(total) && tasks.length >= total)) break;
    }
    return tasks;
  }

  async function fetchAutoAddInfo(shipmentId, scanUnix, version) {
    try {
      const targetId = await findAutoAddTargetId(shipmentId, scanUnix, version);
      if (!targetId || version !== currentRequest) return null;
      const tasks = await loadAuditTasks(todayRange(), version);
      const task = tasks.filter(item => Number(item.end_time || 0) === 0)
        .sort((a, b) => Number(b.start_time || b.validation_start_time || b.ctime || 0) - Number(a.start_time || a.validation_start_time || a.ctime || 0))[0] || tasks[0];
      if (!task?.validation_task_id || version !== currentRequest) return null;
      const url = `https://spx.shopee.com.br/api/in-station/lmhub/audit/target/list?target_id=${encodeURIComponent(targetId)}&task_id=${encodeURIComponent(task.validation_task_id)}&page_no=1&count=100`;
      const response = await fetchJson(url);
      const targets = Array.isArray(response?.data?.list) ? response.data.list : [];
      const target = targets.find(item => String(item?.target_id || '').toUpperCase() === targetId.toUpperCase());
      if (!target) return { nextCycle: true };
      return target.binding_entity ? { route: String(target.binding_entity) } : null;
    } catch {
      return null;
    }
  }

  function showAutoAdd(info) {
    document.getElementById(AUTOADD_ID)?.remove();
    if (!info?.route && !info?.nextCycle) return;
    const notice = document.createElement('div');
    notice.id = AUTOADD_ID;
    notice.classList.toggle('next-cycle', info.nextCycle === true);
    const message = info.nextCycle ? 'AutoAdd para o próximo ciclo' : `AutoAdd na rota ${info.route}`;
    notice.innerHTML = `<span class="icon">${info.nextCycle ? '↻' : '✓'}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(notice);
  }

  function recommendation(attempts, address) {
    // A lista recebida já representa o ciclo correto:
    // - BR normal: histórico normal preservado;
    // - BR de retorno: somente ocorrências desde a primeira entrada em Return_LMHub_Onhold.
    // Portanto não fazemos um segundo corte aqui.
    const relevant = [...attempts].sort((a, b) => Number(a.ctime) - Number(b.ctime));
    const reasons = relevant.map(item => normalize(translateReason(item.on_hold_reason__desc)));
    const validDays = new Set(relevant
      .filter(item => validReasons.has(normalize(translateReason(item.on_hold_reason__desc))))
      .map(item => attemptDay(item.ctime)).filter(Boolean)).size;
    if (reasons.at(-1) === 'fora de rota') return { text: 'REALOCAR / FLEET', className: 'warn' };
    if (finalReasons.has(reasons.at(-1)) || validDays >= 3) return { text: 'RETORNAR AO SOC', className: 'stop' };
    if (address.pending) return { text: 'TRATATIVA DE ENDEREÇO', className: 'address' };
    return { text: 'PROCESSAR PARA ENTREGA', className: '' };
  }

  function reasonClass(reason) {
    const normalized = normalize(reason);
    if (normalized === 'mudanca de endereco' || normalized === 'rejeitado pelo comprador') {
      return 'reason-final';
    }
    if (validReasons.has(normalized)) {
      return 'reason-valid';
    }
    return '';
  }

  function renderAttempts(attempts, address, shipmentId) {
    if (!attempts.length) return '<div class="message">Nenhuma tentativa On Hold encontrada.</div>';
    const ordered = [...attempts].sort((a, b) => Number(a.ctime) - Number(b.ctime));
    const cards = ordered.map((attempt, index) => {
      const reason = translateReason(attempt.on_hold_reason__desc);
      const photo = photoUrl(attempt);
      const isLatestAddress = index === ordered.length - 1 && normalize(reason) === 'endereco nao encontrado';
      const wasCancelled = isLatestAddress && isAddressCancelled(shipmentId);
      const cancelledBadge = wasCancelled ? '<span class="cancelled-badge">Cancelado</span>' : '';
      const addressActions = isLatestAddress && !wasCancelled && address.pending
        ? `<div class="actions" data-reason-id="${escapeHtml(address.reasonId)}" data-local-lang="${escapeHtml(address.localLang)}"><button class="confirm" data-action="confirm">Confirmar</button><button class="cancel" data-action="cancel">Cancelar</button><div class="result"></div></div>`
        : '';
      if (attempt?.return_occurrence) {
        const returnLabel = attempt.current_return ? 'ATUAL DO RETORNO' : 'OCORRÊNCIA DO RETORNO';
        return `<article class="attempt"><span class="index">${index + 1}</span><div><span class="reason ${reasonClass(reason)}">${escapeHtml(reason)}</span><div style="margin-top:6px;color:#fbbf24;font-size:12px;font-weight:900">${returnLabel}</div><div class="driver">${attempt.return_operator ? '<b>Operador:</b> ' + escapeHtml(attempt.return_operator) : 'Ocorrência do retorno'}</div></div><time>${escapeHtml(formatDate(attempt.ctime))}</time></article>`;
      }
      const agency = String(attempt?.assignment_agency || '').trim();
      const agencyInline = agency ? ` — <span class="driver-code">${escapeHtml(agency)}</span>` : '';
      return `<article class="attempt"><span class="index">${index + 1}</span><div><span class="reason ${reasonClass(reason)}">${escapeHtml(reason)}</span>${cancelledBadge}<div class="driver"><b>Motorista:</b> ${escapeHtml(attempt.driver_name || '-')}${agencyInline}<br><span class="driver-code"><b>ID:</b> ${escapeHtml(getDriverId(attempt))}</span></div>${photo ? `<a href="${escapeHtml(photo)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(photo)}" alt="Foto da tentativa"></a>` : ''}${addressActions}</div><time>${escapeHtml(formatDate(attempt.ctime))}</time></article>`;
    }).join('');
    const decision = recommendation(ordered, address);
    return `${cards}<div class="decision ${decision.className}"><strong>${escapeHtml(decision.text)}</strong></div>`;
  }

  function isVisibleElement(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function hasMidwayInterceptModal() {
    const candidates = [...document.querySelectorAll('body *')];
    return candidates.some(element => {
      if (!isVisibleElement(element)) return false;
      const text = normalize(element.innerText || '');
      return text.includes('interceptado no meio do caminho') &&
        text.includes('pedido interceptado');
    });
  }

  async function autoCancelAddressIfNeeded(shipmentId) {
    if (!shipmentId || autoCancelledAddress.has(shipmentId)) return;

    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.dataset.shipmentId !== shipmentId) return;

    const actions = panel.querySelector('.actions');
    if (!actions) return;

    const cancelButton = actions.querySelector('[data-action="cancel"]');
    const confirmButton = actions.querySelector('[data-action="confirm"]');
    if (!cancelButton || !confirmButton) return;
    if (!hasMidwayInterceptModal()) return;

    autoCancelledAddress.add(shipmentId);
    const result = actions.querySelector('.result');

    actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
    if (result) result.textContent = 'Cancelando...';

    try {
      await postJson('https://spx.shopee.com.br/api/in-station/admin/common_site/eha/cancel_eo_reason', {
        shipment_id: shipmentId,
        reason_id: actions.dataset.reasonId || ADDRESS_REASON_ID,
        reason_desc: ADDRESS_REASON_DESC,
        local_lang: actions.dataset.localLang || ''
      });

      markAddressCancelled(shipmentId);
      void sendCancelledAddressToSheet(shipmentId);
      actions.querySelectorAll('button').forEach(item => item.remove());
      if (result) {
        result.textContent = 'Cancelado';
        result.style.fontWeight = '900';
        result.style.fontSize = '14px';
      }

      restoreTrackingFocus();
      window.setTimeout(() => {
        if (currentShipment === shipmentId && authorized) loadShipment(shipmentId);
      }, 250);
    } catch (error) {
      autoCancelledAddress.delete(shipmentId);
      if (result) result.textContent = `Falha: ${error.message}`;
      actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
    }
  }

  function watchForAutoAddressCancel(shipmentId) {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (shipmentId !== currentShipment || Date.now() - startedAt > 7000) {
        clearInterval(timer);
        return;
      }

      const panel = document.getElementById(PANEL_ID);
      const actions = panel?.querySelector('.actions');
      if (!actions) return;

      if (hasMidwayInterceptModal()) {
        clearInterval(timer);
        void autoCancelAddressIfNeeded(shipmentId);
      }
    }, 120);
  }

  async function sendCancelledAddressToSheet(shipmentId) {
    if (!shipmentId) return false;

    try {
      await fetch(SHEET_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ br: shipmentId }),
        keepalive: true
      });

      return true;
    } catch (error) {
      console.warn('[SPX-DV] Falha ao enviar BR para planilha', error);
      return false;
    }
  }


  async function loadShipment(shipmentId, scanUnix = Math.floor(Date.now() / 1000)) {
    const version = ++currentRequest;
    if (!diagnosticView) showPanel(shipmentId, '<div class="message">Consultando histórico...</div>');
    document.getElementById(AUTOADD_ID)?.remove();
    void fetchAutoAddInfo(shipmentId, scanUnix, version).then(info => {
      if (version === currentRequest && shipmentId === currentShipment) showAutoAdd(info);
    });
    try {
      const [history, tracking] = await Promise.all([
        fetchJson(`https://spx.shopee.com.br/api/fleet_order/order/detail/recipient_info?shipment_id=${encodeURIComponent(shipmentId)}&station_type=3`),
        fetchJson(`https://spx.shopee.com.br/api/fleet_order/order/detail/tracking_info?shipment_id=${encodeURIComponent(shipmentId)}`).catch(() => null)
      ]);
      if (version !== currentRequest || shipmentId !== currentShipment) return;
      const attempts = Array.isArray(history?.data?.recipient?.On_Hold) ? history.data.recipient.On_Hold.filter(Boolean) : [];

      // BR NORMAL (LMHub_Onhold / Delivering): sem Return_LMHub_Onhold,
      // preserva exatamente o histórico normal já usado pelo módulo.
      //
      // BR DE RETORNO: a primeira entrada em Return_LMHub_Onhold é a fronteira.
      // Tudo anterior pertence ao fluxo normal antigo. Depois dessa fronteira,
      // Return_LMHub_Returning e novos Return_LMHub_Onhold seguem no MESMO ciclo.
      const returnOccurrences = extractReturnOccurrences(tracking);
      const cycleStart = returnOccurrences.length ? Number(returnOccurrences[0].ctime || 0) : 0;
      const currentAttempts = cycleStart
        ? attempts.filter(item => Number(item?.ctime || 0) >= Number(cycleStart))
        : attempts;

      // Cada ocorrência normal é ligada à AT usada na saída em rota imediatamente
      // anterior (status 2 / Delivering). A AT é então consultada no mesmo endpoint
      // da tela Atribuição de Entrega para obter a coluna Agência (3PL).
      const attemptsWithAgency = await enrichAttemptsWithAssignmentAgency(currentAttempts, tracking, version);
      if (version !== currentRequest || shipmentId !== currentShipment) return;

      // Em BR de retorno, juntamos apenas as ocorrências do ciclo iniciado em
      // Retorno_LMHub_Em_Espera / Return_LMHub_Onhold. O histórico normal anterior some.
      // Se houver mais de uma ocorrência de retorno, todas permanecem visíveis.
      const merged = cycleStart ? [...attemptsWithAgency, ...returnOccurrences] : attemptsWithAgency;
      const visibleAttempts = merged
        .filter((item, index, list) => {
          const key = String(item?.ctime || 0) + '|' + normalize(translateReason(item?.on_hold_reason__desc));
          return list.findIndex(other =>
            String(other?.ctime || 0) + '|' + normalize(translateReason(other?.on_hold_reason__desc)) === key
          ) === index;
        })
        .sort((a, b) => Number(a?.ctime || 0) - Number(b?.ctime || 0));

      let address = { pending: false };
      const latestReason = translateReason([...currentAttempts]
        .sort((a, b) => Number(a.ctime) - Number(b.ctime))
        .at(-1)?.on_hold_reason__desc);
      if (normalize(latestReason) === 'endereco nao encontrado') {
        try { address = getAddressState(await postJson('https://spx.shopee.com.br/api/in-station/admin/common_site/eha/no_reason_inbound', { shipment_id: shipmentId })); }
        catch { address = { pending: false }; }
      }
      if (!diagnosticView) showPanel(shipmentId, renderAttempts(visibleAttempts, address, shipmentId));

      // A automação da aba Dados usa SOMENTE a última ocorrência do ciclo atual.
      // Ocorrências antigas continuam visíveis no painel, mas não são reenviadas.
      const currentOccurrence = visibleAttempts.at(-1);
      if (currentOccurrence) {
        void sendCurrentOccurrenceToDataSheet(
          shipmentId,
          currentOccurrence,
          tracking,
          Boolean(cycleStart),
          scanUnix,
          version
        );
      }

      if (address.pending && normalize(latestReason) === 'endereco nao encontrado') {
        watchForAutoAddressCancel(shipmentId);
      }
    } catch (error) {
      if (!diagnosticView) showPanel(shipmentId, `<div class="message error">Não foi possível consultar: ${escapeHtml(error.message)}</div>`);
    }
  }

  async function handleAction(event) {
    if (event.target.closest('[data-diagnostic]')) {
      diagnosticView = !diagnosticView;
      if (diagnosticView) renderReturnDiagnostics();
      else if (currentShipment && authorized) loadShipment(currentShipment);
      return;
    }
    if (event.target.closest('[data-diag-back]')) {
      diagnosticView = false;
      if (currentShipment && authorized) loadShipment(currentShipment);
      else showPanel('', '<div class="message">Aguardando leitura do BR...</div>');
      return;
    }
    if (event.target.closest('[data-collapse]')) {
      setCollapsed(true);
      return;
    }
    if (event.target.closest('[data-refresh]')) {
      if (currentShipment && authorized) loadShipment(currentShipment);
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || !authorized) return;
    const actions = button.closest('.actions');
    const panel = button.closest(`#${PANEL_ID}`);
    const shipmentId = panel?.dataset.shipmentId;
    const result = actions?.querySelector('.result');
    const action = button.dataset.action;
    if (!shipmentId || !['confirm', 'cancel'].includes(action)) return;
    actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
    if (result) result.textContent = action === 'confirm' ? 'Confirmando...' : 'Cancelando...';
    try {
      if (action === 'confirm') {
        await postJson('https://spx.shopee.com.br/api/in-station/admin/common_site/eha/resolve_reason', { shipment_id: shipmentId, reason_id: actions.dataset.reasonId || ADDRESS_REASON_ID });
      } else {
        await postJson('https://spx.shopee.com.br/api/in-station/admin/common_site/eha/cancel_eo_reason', {
          shipment_id: shipmentId,
          reason_id: actions.dataset.reasonId || ADDRESS_REASON_ID,
          reason_desc: ADDRESS_REASON_DESC,
          local_lang: actions.dataset.localLang || ''
        });
      }
      if (action === 'cancel') {
        markAddressCancelled(shipmentId);
        void sendCancelledAddressToSheet(shipmentId);
      }
      if (result) result.textContent = action === 'confirm' ? 'Motivo confirmado.' : 'Cancelado';
      button.blur();
      restoreTrackingFocus();
    } catch (error) {
      if (result) result.textContent = `Falha: ${error.message}`;
      actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
    }
  }

  function checkShipment() {
    if (!isTargetRoute() || !authorized) return;
    const value = String(findInput()?.value || '').trim().toUpperCase();
    if (!value || value === currentShipment) return;
    autoCancelledAddress.delete(value);
    currentShipment = value;
    const scanUnix = Math.floor(Date.now() / 1000);
    setTimeout(() => { if (currentShipment === value && authorized) loadShipment(value, scanUnix); }, 1200);
  }

  function ensureShipmentKeyListener() {
    if (shipmentKeyListenerInstalled) return;
    shipmentKeyListenerInstalled = true;
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        currentShipment = '';
        checkShipment();
      }
    }, true);
  }

  function clearReceiveUi() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(AUTOADD_ID)?.remove();
    document.getElementById(NOTICE_ID)?.remove();
    if (monitor) clearInterval(monitor);
    monitor = null;
    currentShipment = '';
    diagnosticView = false;
  }

  async function start() {
    ensureStyle();
    if (!isTargetRoute()) return;

    // Ao entrar em Recebimento unitário, a caixa deve SEMPRE nascer aberta,
    // mesmo se ela tiver sido recolhida anteriormente em outra tela/RT.
    collapsed = false;
    diagnosticView = false;

    // Dentro da mesma sessão SPA, uma validação já aprovada continua válida.
    // Em recarga completa a variável volta a false e a validação é refeita.
    if (!authorized) {
      showNotice('Verificando acesso da conta SPX...');
      await validateAccess();
    }

    if (!authorized || !isTargetRoute()) return;

    showPanel('', '<div class="message">Aguardando leitura do BR...</div>');
    checkShipment();

    if (!monitor) monitor = setInterval(checkShipment, 300);
    ensureShipmentKeyListener();
  }

  function syncReceiveRoute(force = false) {
    const currentUrl = location.href;
    if (!force && currentUrl === lastObservedUrl) return;
    lastObservedUrl = currentUrl;

    // O SPX é uma SPA e algumas navegações internas nem sempre são percebidas
    // de forma confiável apenas pelo hashchange. Sempre reconstruímos a UI
    // quando a URL muda e reabrimos ao entrar em singleReceiveNew.
    clearReceiveUi();
    collapsed = false;

    if (isTargetRoute()) void start();
  }

  window.addEventListener('hashchange', () => syncReceiveRoute(true));
  window.addEventListener('popstate', () => syncReceiveRoute(true));

  // Fallback para navegação interna do SPX (pushState/roteador próprio).
  // Garante abertura toda vez que o usuário entra em Recebimento unitário.
  window.setInterval(() => syncReceiveRoute(false), 250);

  installReturnNetworkDiagnostic();
  ensureShipmentKeyListener();
  if (isTargetRoute()) void start();
})();
