(() => {
  'use strict';

  const APP_MARKER = 'spxdvAssistantActive';
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
    ['parcel lost', 'Item perdido'],
    ['recipient change location', 'Mudança de endereço'],
    ['recipient reject', 'Recusado por terceiros'],
    ['recipient unavailable for parcel', 'Ausente'],
    ['reject - buyers change their mind', 'Rejeitado pelo comprador'],
    ['risky area of delivery', 'Área de risco'],
    ['robbery attempt', 'Tentativa de roubo/assalto'],
    ['theft', 'Roubo/assalto'],
    ['unforeseen circumstances', 'Motorista desistiu da rota'],
    ['vehicle breakdown', 'Problemas mecânicos'],
    ['wrongly assigned', 'Fora de rota']
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

  function isTargetRoute() {
    return location.origin === 'https://spx.shopee.com.br' && ROUTES.some(route => location.hash.startsWith(route));
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
      #${PANEL_ID}{position:fixed;z-index:999999;top:16px;left:16px;right:auto;width:min(520px,calc(100vw - 32px));max-height:82vh;overflow:hidden;border:1px solid #334155;border-radius:14px;background:#0f172a;color:#f8fafc;box-shadow:0 22px 62px #0008;font:15px Arial,sans-serif}
      #${PANEL_ID}[hidden]{display:none!important}#${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} header{position:relative;padding:15px 92px 13px 15px;border-bottom:1px solid #334155;background:linear-gradient(135deg,#ff600033,#0f172a);cursor:grab;user-select:none;touch-action:none}
      #${PANEL_ID}.dragging header{cursor:grabbing}#${PANEL_ID} h2{margin:0;font-size:19px}#${PANEL_ID} header small{display:block;margin-top:5px;color:#cbd5e1;font-size:13px}#${PANEL_ID} .header-actions{position:absolute;top:9px;right:9px;display:flex;gap:6px}#${PANEL_ID} .icon-button{display:grid;place-items:center;width:32px;height:32px;border:1px solid #475569;border-radius:8px;background:#1e293b;color:#fff;font-size:18px;cursor:pointer}
      #${PANEL_ID} .body{max-height:65vh;overflow:auto;padding:10px}#${PANEL_ID} .message{padding:22px;text-align:center;color:#cbd5e1}#${PANEL_ID} .error{color:#fca5a5}
      #${PANEL_ID} .attempt{display:grid;grid-template-columns:27px minmax(0,1fr) auto;gap:9px;margin-bottom:8px;padding:10px;border:1px solid #334155;border-radius:10px;background:#ffffff08}
      #${PANEL_ID} .index{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#334155;font-size:13px;font-weight:900}#${PANEL_ID} .reason{display:inline-block;padding:4px 8px;border-radius:999px;background:#16a34a33;color:#bbf7d0;font-size:13px;font-weight:800}
      #${PANEL_ID} .driver{margin-top:7px;color:#dbeafe;font-size:13px}#${PANEL_ID} time{color:#94a3b8;font-size:12px;white-space:nowrap}#${PANEL_ID} img{width:58px;height:58px;margin-top:8px;border-radius:7px;object-fit:cover}
      #${PANEL_ID} .actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}#${PANEL_ID} .actions button{border:0;border-radius:8px;padding:10px;color:#fff;font-size:14px;font-weight:900;cursor:pointer}#${PANEL_ID} .confirm{background:#16a34a}#${PANEL_ID} .cancel{background:#dc2626}#${PANEL_ID} .result{grid-column:1/-1;color:#cbd5e1;font-size:12px}
      #${PANEL_ID} .decision{margin-top:10px;padding:12px;border:1px solid #22c55e66;border-radius:10px;background:#16a34a22;text-align:center}#${PANEL_ID} .decision.warn{border-color:#fb923c88;background:#9a341e33}#${PANEL_ID} .decision.stop{border-color:#ef444488;background:#7f1d1d44}#${PANEL_ID} .decision.address{border-color:#c084fc88;background:#6b21a844}#${PANEL_ID} .decision strong{font-size:16px}
      #${TOGGLE_ID}{position:fixed;z-index:999998;left:16px;bottom:18px;border:1px solid #fb923c;border-radius:999px;padding:11px 16px;background:#0f172a;color:#fff;box-shadow:0 12px 28px #0006;font:700 14px Arial,sans-serif;cursor:pointer}#${TOGGLE_ID}[hidden]{display:none!important}
      #${AUTOADD_ID}{position:fixed;z-index:999997;left:16px;bottom:72px;max-width:min(520px,calc(100vw - 32px));display:flex;align-items:center;gap:10px;padding:12px 15px;border:1px solid #22c55e88;border-radius:12px;background:#052e22;color:#dcfce7;box-shadow:0 12px 28px #0006;font:700 14px Arial,sans-serif}#${AUTOADD_ID}.next-cycle{border-color:#fb923c;background:#431407;color:#ffedd5}#${AUTOADD_ID} .icon{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#ffffff18;font-size:17px}
      #${NOTICE_ID}{position:fixed;right:16px;top:16px;z-index:999999;max-width:360px;padding:14px;border:1px solid #fb923c;border-radius:10px;background:#0f172a;color:#f8fafc;font:13px/1.5 Arial,sans-serif}
    `;
    document.documentElement.appendChild(style);
  }

  function showPanel(shipmentId, content) {
    ensureStyle();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.innerHTML = '<header><h2>Histórico de tentativas</h2><small>Shipment ID: <strong></strong></small><div class="header-actions"><button class="icon-button" data-refresh title="Atualizar">↻</button><button class="icon-button" data-collapse title="Recolher">−</button></div></header><div class="body"></div>';
      panel.addEventListener('click', handleAction);
      document.body.appendChild(panel);
      restorePanelPosition(panel);
      enablePanelDragging(panel);
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
    toggle.hidden = true;
    toggle.addEventListener('click', () => setCollapsed(false));
    document.body.appendChild(toggle);
    return toggle;
  }

  function setCollapsed(value) {
    collapsed = value;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = collapsed;
    const toggle = ensureToggle();
    toggle.hidden = !collapsed;
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

  function formatDate(timestamp) {
    if (!Number(timestamp)) return '-';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(Number(timestamp) * 1000));
  }

  function translateReason(reason) {
    return translations.get(normalize(reason)) || reason || 'Motivo não informado';
  }

  function photoUrl(attempt) {
    const image = Array.isArray(attempt?.image_list) ? attempt.image_list.find(item => item?.image_url)?.image_url : '';
    const photo = Array.isArray(attempt?.photo_list) ? attempt.photo_list.find(Boolean) : '';
    const value = String(image || photo || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `https://spx.shopee.com.br/shopee-live-spx-perm-data/${value.replace(/^\/+/, '')}`;
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

  function assignmentTaskId(message) {
    const text = String(message || '');
    if (!/Assignment Task/i.test(text)) return '';
    return String(text.match(/\[(AT[^\]\s]+)\]/i)?.[1] || '').trim();
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
    const ordered = [...attempts].sort((a, b) => Number(a.ctime) - Number(b.ctime));
    const reasons = ordered.map(item => normalize(translateReason(item.on_hold_reason__desc)));
    const validDays = new Set(ordered
      .filter(item => validReasons.has(normalize(translateReason(item.on_hold_reason__desc))))
      .map(item => attemptDay(item.ctime)).filter(Boolean)).size;
    if (reasons.at(-1) === 'fora de rota') return { text: 'REALOCAR / FLEET', className: 'warn' };
    if (reasons.some(reason => finalReasons.has(reason)) || validDays >= 3) return { text: 'RETORNAR AO SOC', className: 'stop' };
    if (address.pending) return { text: 'TRATATIVA DE ENDEREÇO', className: 'address' };
    return { text: 'PROCESSAR PARA ENTREGA', className: '' };
  }

  function renderAttempts(attempts, address) {
    if (!attempts.length) return '<div class="message">Nenhuma tentativa On Hold encontrada.</div>';
    const ordered = [...attempts].sort((a, b) => Number(a.ctime) - Number(b.ctime));
    const cards = ordered.map((attempt, index) => {
      const reason = translateReason(attempt.on_hold_reason__desc);
      const photo = photoUrl(attempt);
      const addressActions = index === ordered.length - 1 && normalize(reason) === 'endereco nao encontrado' && address.pending
        ? `<div class="actions" data-reason-id="${escapeHtml(address.reasonId)}" data-local-lang="${escapeHtml(address.localLang)}"><button class="confirm" data-action="confirm">Confirmar</button><button class="cancel" data-action="cancel">Cancelar</button><div class="result"></div></div>`
        : '';
      return `<article class="attempt"><span class="index">${index + 1}</span><div><span class="reason">${escapeHtml(reason)}</span><div class="driver"><b>Motorista:</b> ${escapeHtml(attempt.driver_name || '-')}</div>${photo ? `<a href="${escapeHtml(photo)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(photo)}" alt="Foto da tentativa"></a>` : ''}${addressActions}</div><time>${escapeHtml(formatDate(attempt.ctime))}</time></article>`;
    }).join('');
    const decision = recommendation(ordered, address);
    return `${cards}<div class="decision ${decision.className}"><strong>${escapeHtml(decision.text)}</strong></div>`;
  }

  async function loadShipment(shipmentId, scanUnix = Math.floor(Date.now() / 1000)) {
    const version = ++currentRequest;
    showPanel(shipmentId, '<div class="message">Consultando histórico...</div>');
    document.getElementById(AUTOADD_ID)?.remove();
    void fetchAutoAddInfo(shipmentId, scanUnix, version).then(info => {
      if (version === currentRequest && shipmentId === currentShipment) showAutoAdd(info);
    });
    try {
      const history = await fetchJson(`https://spx.shopee.com.br/api/fleet_order/order/detail/recipient_info?shipment_id=${encodeURIComponent(shipmentId)}&station_type=3`);
      if (version !== currentRequest || shipmentId !== currentShipment) return;
      const attempts = Array.isArray(history?.data?.recipient?.On_Hold) ? history.data.recipient.On_Hold.filter(Boolean) : [];
      let address = { pending: false };
      const latestReason = translateReason([...attempts].sort((a, b) => Number(a.ctime) - Number(b.ctime)).at(-1)?.on_hold_reason__desc);
      if (normalize(latestReason) === 'endereco nao encontrado') {
        try { address = getAddressState(await postJson('https://spx.shopee.com.br/api/in-station/admin/common_site/eha/no_reason_inbound', { shipment_id: shipmentId })); }
        catch { address = { pending: false }; }
      }
      showPanel(shipmentId, renderAttempts(attempts, address));
    } catch (error) {
      showPanel(shipmentId, `<div class="message error">Não foi possível consultar: ${escapeHtml(error.message)}</div>`);
    }
  }

  async function handleAction(event) {
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
      if (result) result.textContent = action === 'confirm' ? 'Motivo confirmado.' : 'Motivo cancelado.';
    } catch (error) {
      if (result) result.textContent = `Falha: ${error.message}`;
      actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
    }
  }

  function checkShipment() {
    if (!isTargetRoute() || !authorized) return;
    const value = String(findInput()?.value || '').trim().toUpperCase();
    if (!value || value === currentShipment) return;
    currentShipment = value;
    const scanUnix = Math.floor(Date.now() / 1000);
    setTimeout(() => { if (currentShipment === value && authorized) loadShipment(value, scanUnix); }, 1200);
  }

  async function start() {
    ensureStyle();
    if (!isTargetRoute()) return;
    showNotice('Verificando acesso da conta SPX...');
    await validateAccess();
    if (!authorized || monitor) return;
    monitor = setInterval(checkShipment, 300);
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter') { currentShipment = ''; checkShipment(); }
    }, true);
  }

  window.addEventListener('hashchange', () => {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(TOGGLE_ID)?.remove();
    document.getElementById(AUTOADD_ID)?.remove();
    document.getElementById(NOTICE_ID)?.remove();
    if (monitor) clearInterval(monitor);
    monitor = null; authorized = false; currentShipment = ''; start();
  });

  start();
})();
