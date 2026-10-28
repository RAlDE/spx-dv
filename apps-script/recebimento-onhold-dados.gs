/**
 * SPX-DV -> RECEBIMENTO DE PEDIDOS On Hold
 *
 * Vincular este código à implantação de um Web App do Google Apps Script.
 * A extensão envia JSON como text/plain para doPost().
 *
 * Regras operacionais:
 * - aba alvo: Dados
 * - não escrever nas colunas A, B e H
 * - C é a referência de ocupação da linha
 * - linha verde é separador de recebimento e nunca pode ser usada
 * - entradas manuais em C são preservadas
 * - a mesma ocorrência (BR + timestamp) não é duplicada
 * - o controle de duplicidade fica em aba técnica oculta, nunca em notas da coluna C
 * - fórmulas nas células-alvo podem ser substituídas pelos dados recebidos
 */

const SPX_DV_CONFIG = Object.freeze({
  spreadsheetId: '14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY',
  sheetName: 'Dados',
  controlSheetName: '_SPX_DV_CONTROLE',
  dashboardSheetName: '_SPX_DV_DASHBOARD',
  dashboardCleanupProperty: 'SPX_DV_DASHBOARD_CLEAN_DAY_V1',
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
  batchStartProperty: 'SPX_DV_BATCH_START_V1',
  timezone: 'America/Sao_Paulo'
});

function doGet(e) {
  const view = clean_(e && e.parameter && e.parameter.view).toLowerCase();
  if (view === 'dashboard') {
    return HtmlService
      .createHtmlOutput(dashboardHtml_())
      .setTitle('SPX-DV · Dashboard de Recebimento');
  }

  return jsonResponse_({
    ok: true,
    service: 'SPX-DV recebimento On Hold',
    sheet: SPX_DV_CONFIG.sheetName,
    dashboard: true
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = parsePayload_(e);
    const action = clean_(payload && payload.action).toLowerCase();
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const dashboardSheet = getDashboardSheet_(spreadsheet);

    cleanupOldConfirmedDashboard_(dashboardSheet);

    if (action === 'dashboard_upsert') {
      const dashboardRecord = normalizeDashboardRecord_(payload);
      if (!dashboardRecord.occurrenceKey) {
        return jsonResponse_({ ok: false, error: 'occurrence_key inválida' });
      }
      const result = upsertDashboardRecord_(dashboardSheet, dashboardRecord);
      SpreadsheetApp.flush();
      return jsonResponse_({
        ok: true,
        dashboard: true,
        occurrence_key: dashboardRecord.occurrenceKey,
        status: result.status
      });
    }

    if (action === 'dashboard_merge') {
      const records = Array.isArray(payload && payload.records) ? payload.records : [];
      let merged = 0;
      records.forEach(item => {
        const record = normalizeDashboardRecord_(item);
        if (!record.occurrenceKey) return;
        upsertDashboardRecord_(dashboardSheet, record);
        merged += 1;
      });
      SpreadsheetApp.flush();
      return jsonResponse_({ ok: true, dashboard: true, merged });
    }

    const record = normalizeRecord_(payload);

    if (!record.shipmentId) {
      return jsonResponse_({ ok: false, error: 'shipment_id obrigatório' });
    }
    if (!record.occurrenceTimestamp) {
      return jsonResponse_({ ok: false, error: 'occurrence_timestamp obrigatório' });
    }

    // A ficha entra primeiro na fila central. Se qualquer etapa da gravação em
    // Dados falhar, ela permanece pendente e continua visível no Dashboard.
    const dashboardRecord = normalizeDashboardRecord_(payload);
    if (dashboardRecord.occurrenceKey) {
      upsertDashboardRecord_(dashboardSheet, dashboardRecord);
    }

    const sheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName);
    if (!sheet) {
      return jsonResponse_({ ok: false, error: 'Aba Dados não encontrada' });
    }

    SpreadsheetApp.flush();

    const occurrenceKey = record.shipmentId + '|' + record.occurrenceTimestamp;
    const controlSheet = getControlSheet_(spreadsheet);

    if (occurrenceAlreadyRecorded_(controlSheet, occurrenceKey)) {
      markDashboardConfirmed_(dashboardSheet, occurrenceKey);
      SpreadsheetApp.flush();
      return jsonResponse_({
        ok: true,
        duplicate: true,
        occurrence_key: occurrenceKey
      });
    }

    const row = findWritableRow_(sheet);
    writeRecord_(sheet, row, record);
    SpreadsheetApp.flush();

    const writtenShipment = clean_(sheet.getRange(row, 3).getDisplayValue()).toUpperCase();
    if (writtenShipment !== record.shipmentId) {
      throw new Error('Falha ao confirmar gravação do BR na linha ' + row);
    }

    rememberOccurrence_(controlSheet, occurrenceKey, row);
    markDashboardConfirmed_(dashboardSheet, occurrenceKey);
    SpreadsheetApp.flush();

    PropertiesService.getScriptProperties()
      .setProperty(SPX_DV_CONFIG.pointerProperty, String(row + 1));

    return jsonResponse_({
      ok: true,
      inserted: true,
      row,
      occurrence_key: occurrenceKey
    });
  } catch (error) {
    console.error('[SPX-DV] Falha no recebimento da planilha', error);
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  } finally {
    lock.releaseLock();
  }
}

function parsePayload_(e) {
  const text = String(e && e.postData && e.postData.contents || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('JSON inválido');
  }
}

function normalizeRecord_(payload) {
  const timestamp = Number(payload && payload.occurrence_timestamp || 0);
  const occurrenceDate = timestamp > 0
    ? Utilities.formatDate(new Date(timestamp * 1000), SPX_DV_CONFIG.timezone, 'dd-MM-yyyy')
    : '';

  return {
    shipmentId: clean_(payload && (payload.shipment_id || payload.br)).toUpperCase(),
    reason: clean_(payload && payload.reason),
    driverId: clean_(payload && payload.driver_id),
    driverName: clean_(payload && payload.driver_name),
    agency: clean_(payload && payload.agency),
    neighborhood: clean_(payload && payload.neighborhood),
    occurrenceTimestamp: timestamp > 0 ? Math.floor(timestamp) : 0,
    occurrenceDate,
    flow: clean_(payload && payload.flow)
  };
}


function normalizeDashboardRecord_(payload) {
  const shipmentId = clean_(payload && (payload.shipment_id || payload.br)).toUpperCase();
  const occurrenceTimestamp = Math.floor(Number(payload && payload.occurrence_timestamp || 0));
  const occurrenceKey = shipmentId && occurrenceTimestamp
    ? shipmentId + '|' + occurrenceTimestamp
    : clean_(payload && payload.occurrence_key);

  let receivedAt = Number(payload && payload.received_at || 0);
  if (receivedAt > 0 && receivedAt < 1000000000000) receivedAt *= 1000;
  if (!receivedAt) receivedAt = Date.now();

  return {
    occurrenceKey,
    receivedDay: Utilities.formatDate(new Date(receivedAt), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd'),
    receivedAt: Math.floor(receivedAt),
    shipmentId,
    reason: clean_(payload && payload.reason),
    driverId: clean_(payload && payload.driver_id),
    driverName: clean_(payload && payload.driver_name),
    agency: clean_(payload && payload.agency),
    neighborhood: clean_(payload && payload.neighborhood),
    occurrenceTimestamp,
    flow: clean_(payload && payload.flow),
    operatorLogin: clean_(payload && payload.operator_login).toLowerCase(),
    status: clean_(payload && payload.status).toLowerCase() === 'confirmed' ? 'confirmed' : 'captured',
    updatedAt: Date.now()
  };
}

function getDashboardSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.dashboardSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SPX_DV_CONFIG.dashboardSheetName);
    sheet.getRange(1, 1, 1, 14).setValues([[
      'occurrence_key',
      'received_day',
      'received_at',
      'shipment_id',
      'reason',
      'driver_id',
      'driver_name',
      'agency',
      'neighborhood',
      'occurrence_timestamp',
      'flow',
      'operator_login',
      'status',
      'updated_at'
    ]]);
    sheet.setFrozenRows(1);
  }

  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function findDashboardRow_(sheet, occurrenceKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !occurrenceKey) return 0;

  const match = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(occurrenceKey)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  return match ? match.getRow() : 0;
}

function dashboardRecordFromRow_(values) {
  return {
    occurrenceKey: clean_(values[0]),
    receivedDay: clean_(values[1]),
    receivedAt: Number(values[2] || 0),
    shipmentId: clean_(values[3]).toUpperCase(),
    reason: clean_(values[4]),
    driverId: clean_(values[5]),
    driverName: clean_(values[6]),
    agency: clean_(values[7]),
    neighborhood: clean_(values[8]),
    occurrenceTimestamp: Number(values[9] || 0),
    flow: clean_(values[10]),
    operatorLogin: clean_(values[11]).toLowerCase(),
    status: clean_(values[12]).toLowerCase() || 'captured',
    updatedAt: Number(values[13] || 0)
  };
}

function dashboardRowValues_(record) {
  return [[
    record.occurrenceKey,
    record.receivedDay,
    record.receivedAt,
    record.shipmentId,
    record.reason,
    record.driverId,
    record.driverName,
    record.agency,
    record.neighborhood,
    record.occurrenceTimestamp,
    record.flow,
    record.operatorLogin,
    record.status,
    record.updatedAt
  ]];
}

function upsertDashboardRecord_(sheet, incoming) {
  const row = findDashboardRow_(sheet, incoming.occurrenceKey);
  let current = null;

  if (row) {
    current = dashboardRecordFromRow_(
      sheet.getRange(row, 1, 1, 14).getValues()[0]
    );
  }

  const status = current && current.status === 'confirmed'
    ? 'confirmed'
    : incoming.status;

  const merged = {
    occurrenceKey: incoming.occurrenceKey,
    receivedDay: current && current.receivedDay || incoming.receivedDay,
    receivedAt: current && current.receivedAt || incoming.receivedAt,
    shipmentId: incoming.shipmentId || current && current.shipmentId || '',
    reason: incoming.reason || current && current.reason || '',
    driverId: incoming.driverId || current && current.driverId || '',
    driverName: incoming.driverName || current && current.driverName || '',
    agency: incoming.agency || current && current.agency || '',
    neighborhood: incoming.neighborhood || current && current.neighborhood || '',
    occurrenceTimestamp: incoming.occurrenceTimestamp || current && current.occurrenceTimestamp || 0,
    flow: incoming.flow || current && current.flow || '',
    operatorLogin: current && current.operatorLogin || incoming.operatorLogin || '',
    status,
    updatedAt: Date.now()
  };

  const targetRow = row || Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, 14).setValues(dashboardRowValues_(merged));
  return merged;
}

function markDashboardConfirmed_(sheet, occurrenceKey) {
  const row = findDashboardRow_(sheet, occurrenceKey);
  if (!row) return false;

  sheet.getRange(row, 13, 1, 2).setValues([[
    'confirmed',
    Date.now()
  ]]);
  return true;
}

function cleanupOldConfirmedDashboard_(sheet) {
  const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  const properties = PropertiesService.getScriptProperties();
  const cleanedDay = properties.getProperty(SPX_DV_CONFIG.dashboardCleanupProperty);
  if (cleanedDay === today) return;

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const day = clean_(values[index][1]);
      const status = clean_(values[index][12]).toLowerCase();
      if (day && day !== today && status === 'confirmed') {
        sheet.deleteRow(index + 2);
      }
    }
  }

  properties.setProperty(SPX_DV_CONFIG.dashboardCleanupProperty, today);
}

function getDashboardData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const sheet = getDashboardSheet_(spreadsheet);
    cleanupOldConfirmedDashboard_(sheet);

    const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
    const lastRow = sheet.getLastRow();
    const records = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, 14).getValues().map(dashboardRecordFromRow_)
      : [];

    return {
      ok: true,
      today,
      records: records.map(record => ({
        occurrence_key: record.occurrenceKey,
        received_day: record.receivedDay,
        received_at: record.receivedAt,
        shipment_id: record.shipmentId,
        reason: record.reason,
        driver_id: record.driverId,
        driver_name: record.driverName,
        agency: record.agency,
        neighborhood: record.neighborhood,
        occurrence_timestamp: record.occurrenceTimestamp,
        flow: record.flow,
        operator_login: record.operatorLogin,
        status: record.status
      }))
    };
  } finally {
    lock.releaseLock();
  }
}

function clearConfirmedDashboard() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const sheet = getDashboardSheet_(spreadsheet);
    const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, removed: 0 };

    const values = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    let removed = 0;

    for (let index = values.length - 1; index >= 0; index -= 1) {
      const day = clean_(values[index][1]);
      const status = clean_(values[index][12]).toLowerCase();
      if (day === today && status === 'confirmed') {
        sheet.deleteRow(index + 2);
        removed += 1;
      }
    }

    return { ok: true, removed };
  } finally {
    lock.releaseLock();
  }
}

function dashboardHtml_() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SPX-DV · Dashboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#020202;color:#f8fafc;font:13px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}main{max-width:1600px;margin:auto;padding:26px 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:16px 18px;border:1px solid #4a260f;border-radius:14px;background:#070707;box-shadow:0 0 22px rgba(249,115,22,.16),inset 0 -1px rgba(249,115,22,.3)}h1{font-size:27px;letter-spacing:-.5px;margin:0;text-shadow:0 0 16px rgba(249,115,22,.34)}h2{font-size:16px;margin:0;color:#fff7ed;text-shadow:0 0 11px rgba(249,115,22,.26)}.muted{color:#9ca3af}.actions,.filters{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
button,select,input{font:inherit}button{background:#111;color:#fff;border:1px solid #6b3415;border-radius:9px;padding:10px 14px;cursor:pointer;font-weight:750;box-shadow:0 0 12px rgba(249,115,22,.1)}button:hover{background:#1a0d07;border-color:#f97316}button.danger{color:#fed7aa}
.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric,.panel{background:#080808;border:1px solid #252525;border-radius:14px;padding:18px;box-shadow:0 10px 28px rgba(0,0,0,.42)}.metric{border-top-color:#6b3415}.metric.clickable{cursor:pointer}.metric.clickable:hover,.metric.clickable.active{border-color:#f97316;box-shadow:0 0 20px rgba(249,115,22,.18),0 10px 28px rgba(0,0,0,.42)}.metric span{display:block;font-size:11px;color:#a3a3a3;text-transform:uppercase;letter-spacing:.45px}.metric strong{display:block;font-size:28px;margin-top:5px}
.panel{margin-bottom:16px}.panel-head{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:-18px -18px 14px;padding:16px 18px 14px;background:#090603;border-bottom:1px solid #6b3415;border-radius:14px 14px 0 0;box-shadow:0 5px 18px rgba(249,115,22,.11)}
.search{width:min(360px,100%);padding:10px 12px;background:#030303;border:1px solid #3f3f46;color:#fff;border-radius:9px}.operator-filter{padding:10px 12px;background:#030303;border:1px solid #6b3415;color:#fff;border-radius:9px;min-width:210px}
.ranking{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rank-item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid #2b211b;border-radius:10px;background:#050505}.rank-pos{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#351a0b;color:#fdba74;font-weight:900}.rank-name{font-weight:800}.rank-meta{color:#9ca3af;font-size:11px}.rank-count{font-size:20px;font-weight:900;color:#fdba74}
.table-wrap{max-height:64vh;overflow:auto;border:1px solid #262626;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:1450px;background:#050505}th,td{padding:11px 12px;border-bottom:1px solid #262626;text-align:left;vertical-align:top}th{position:sticky;top:0;z-index:1;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.35px;box-shadow:inset 0 -1px #7c2d12,0 4px 14px rgba(249,115,22,.08)}tbody tr:hover{background:#100b08}
.status{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f59e0b2c;color:#fde68a;font-size:11px;font-weight:800}.status.confirmed{background:#16a34a2c;color:#bbf7d0}.warning{margin:0 0 16px;padding:11px 14px;border:1px solid #f59e0b55;border-radius:10px;background:#78350f25;color:#fde68a}.empty{padding:30px;text-align:center;color:#94a3b8}footer{color:#94a3b8;font-size:11px}
@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.ranking{grid-template-columns:1fr}main{padding:14px}}@media(max-width:520px){.metrics{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<header><div><h1>Dashboard de Recebimento</h1><div class="muted">SPX-DV · fila central integrada de todos os recebimentos</div></div><div class="actions"><button id="clearConfirmed" class="danger">Limpar confirmados</button><button id="refresh">Atualizar</button></div></header>
<div id="warning"></div>
<section class="metrics">
<div class="metric clickable active" id="cardToday"><span>Capturados hoje</span><strong id="mTotal">0</strong></div>
<div class="metric clickable" id="cardPending"><span>Na fila</span><strong id="mPending">0</strong></div>
<div class="metric"><span>Confirmados</span><strong id="mConfirmed">0</strong></div>
<div class="metric clickable" id="cardOld"><span>Pendentes antigos</span><strong id="mOld">0</strong></div>
<div class="metric"><span>Operadores hoje</span><strong id="mOperators">0</strong></div>
</section>
<section class="panel">
<div class="panel-head"><div><h2>Top 10 motoristas ofensores do dia</h2><div class="muted">Quantidade de ocorrências recebidas hoje por motorista.</div></div></div>
<div id="topDrivers" class="ranking"></div>
</section>
<section class="panel">
<div class="panel-head"><div><h2 id="tableTitle">Recebimentos de hoje</h2><div id="tableSubtitle" class="muted">Todos os logins e computadores aparecem nesta mesma fila central.</div></div><div class="filters"><select id="operator" class="operator-filter"><option value="">Todos os operadores</option></select><input id="search" class="search" placeholder="Pesquisar pedido, login, motorista, 3PL, bairro ou motivo"></div></div>
<div class="table-wrap"><table><thead><tr><th>Recebido em</th><th>Pedido</th><th>Motivo do APP</th><th>Driver ID</th><th>Motorista</th><th>Transportadora 3PL</th><th>Bairro</th><th>Data da ocorrência</th><th>Login SPX</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty" hidden>Nenhum recebimento.</div></div>
</section>
<footer>Registros confirmados permanecem durante o dia. Pendentes nunca são removidos automaticamente na virada do dia.</footer>
</main>
<script>
const state={data:null,view:'today'};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const dt=ms=>ms?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(Number(ms))):'-';
const occ=sec=>sec?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(Number(sec)*1000)):'-';
const statusLabel=s=>s==='confirmed'?'Confirmado':'Pendente';

function requestData(){
  google.script.run.withSuccessHandler(data=>{state.data=data;render();}).withFailureHandler(err=>{$('warning').innerHTML='<div class="warning">Falha ao atualizar Dashboard: '+esc(err&&err.message||err)+'</div>';}).getDashboardData();
}

function render(){
  const data=state.data||{today:'',records:[]};
  const records=Array.isArray(data.records)?data.records:[];
  const today=records.filter(r=>r.received_day===data.today);
  const pendingToday=today.filter(r=>r.status!=='confirmed');
  const oldPending=records.filter(r=>r.received_day&&r.received_day!==data.today&&r.status!=='confirmed');

  $('mTotal').textContent=today.length;
  $('mPending').textContent=pendingToday.length;
  $('mConfirmed').textContent=today.filter(r=>r.status==='confirmed').length;
  $('mOld').textContent=oldPending.length;
  $('mOperators').textContent=new Set(today.map(r=>r.operator_login).filter(Boolean)).size;
  $('warning').innerHTML=oldPending.length?'<div class="warning">⚠ '+oldPending.length+' pendente(s) de dias anteriores. Clique em “Pendentes antigos” para visualizar.</div>':'';

  const drivers=new Map();
  today.forEach(r=>{
    const id=String(r.driver_id||'').trim(),name=String(r.driver_name||'').trim();
    if(!id&&!name)return;
    const key=id||name.toLowerCase();
    const item=drivers.get(key)||{id,name:name||'Motorista não identificado',count:0};
    item.count++;drivers.set(key,item);
  });
  const top=[...drivers.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR')).slice(0,10);
  $('topDrivers').innerHTML=top.length?top.map((x,i)=>'<div class="rank-item"><span class="rank-pos">'+(i+1)+'</span><div><div class="rank-name">'+esc(x.name)+'</div><div class="rank-meta">ID: '+esc(x.id||'Não informado')+'</div></div><span class="rank-count">'+x.count+'</span></div>').join(''):'<div class="empty">Ainda não há motoristas para o ranking de hoje.</div>';

  let list=today;
  if(state.view==='pending')list=pendingToday;
  if(state.view==='old')list=oldPending;
  list=[...list].sort((a,b)=>Number(b.received_at||0)-Number(a.received_at||0));

  $('cardToday').classList.toggle('active',state.view==='today');
  $('cardPending').classList.toggle('active',state.view==='pending');
  $('cardOld').classList.toggle('active',state.view==='old');
  $('tableTitle').textContent=state.view==='pending'?'Pendentes de hoje':state.view==='old'?'Pendentes de dias anteriores':'Recebimentos de hoje';
  $('tableSubtitle').textContent=state.view==='pending'?'Registros de hoje que ainda não tiveram confirmação da gravação em Dados.':state.view==='old'?'Registros preservados automaticamente até serem confirmados.':'Todos os logins e computadores aparecem nesta mesma fila central.';

  const operators=[...new Set(list.map(r=>String(r.operator_login||'').trim().toLowerCase()).filter(Boolean))].sort();
  const previous=$('operator').value;
  $('operator').innerHTML='<option value="">Todos os operadores</option>'+operators.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  if(operators.includes(previous))$('operator').value=previous;

  const q=String($('search').value||'').trim().toLowerCase(),opFilter=String($('operator').value||'').toLowerCase();
  const filtered=list.filter(r=>{
    const text=[r.shipment_id,r.reason,r.driver_id,r.driver_name,r.agency,r.neighborhood,r.operator_login,statusLabel(r.status)].join(' ').toLowerCase();
    return (!q||text.includes(q))&&(!opFilter||String(r.operator_login||'').toLowerCase()===opFilter);
  });

  $('rows').innerHTML=filtered.map(r=>'<tr><td>'+esc(dt(r.received_at))+'</td><td><strong>'+esc(r.shipment_id)+'</strong></td><td>'+esc(r.reason)+'</td><td>'+esc(r.driver_id)+'</td><td>'+esc(r.driver_name)+'</td><td>'+esc(r.agency)+'</td><td>'+esc(r.neighborhood)+'</td><td>'+esc(occ(r.occurrence_timestamp))+'</td><td>'+esc(r.operator_login||'Não identificado')+'</td><td><span class="status '+(r.status==='confirmed'?'confirmed':'')+'">'+esc(statusLabel(r.status))+'</span></td></tr>').join('');
  $('empty').hidden=filtered.length>0;
  $('empty').textContent=state.view==='old'?'Nenhum pendente antigo.':state.view==='pending'?'Nenhum pendente de hoje.':'Nenhum recebimento hoje.';
}

$('cardToday').onclick=()=>{state.view='today';render();};
$('cardPending').onclick=()=>{state.view='pending';render();};
$('cardOld').onclick=()=>{state.view='old';render();};
$('search').oninput=render;
$('operator').onchange=render;
$('refresh').onclick=requestData;
$('clearConfirmed').onclick=()=>{
  const count=state.data&&state.data.records?state.data.records.filter(r=>r.received_day===state.data.today&&r.status==='confirmed').length:0;
  if(!count){alert('Não há registros confirmados para limpar hoje.');return;}
  if(!confirm('Limpar '+count+' registro(s) confirmado(s) de hoje?\\n\\nPendentes não serão apagados.'))return;
  google.script.run.withSuccessHandler(()=>requestData()).withFailureHandler(err=>alert('Falha: '+(err&&err.message||err))).clearConfirmedDashboard();
};
requestData();
setInterval(requestData,5000);
</script>
</body>
</html>`;
}

function writeRecord_(sheet, row, record) {
  // C:G em uma única operação.
  sheet.getRange(row, 3, 1, 5).setValues([[
    record.shipmentId,
    record.reason,
    numericIfSafe_(record.driverId),
    record.driverName,
    record.agency
  ]]);

  // H permanece intocada. I:J são gravadas juntas.
  sheet.getRange(row, 9, 1, 2).setValues([[
    record.neighborhood,
    record.occurrenceDate
  ]]);
}

function getControlSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.controlSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SPX_DV_CONFIG.controlSheetName);
    sheet.getRange(1, 1, 1, 3).setValues([[
      'occurrence_key',
      'dados_row',
      'registered_at'
    ]]);
  }

  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function occurrenceAlreadyRecorded_(controlSheet, occurrenceKey) {
  const lastRow = controlSheet.getLastRow();
  if (lastRow < 2) return false;

  const match = controlSheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(occurrenceKey)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  return Boolean(match);
}

function rememberOccurrence_(controlSheet, occurrenceKey, dadosRow) {
  const row = Math.max(controlSheet.getLastRow() + 1, 2);
  controlSheet.getRange(row, 1, 1, 3).setValues([[
    occurrenceKey,
    dadosRow,
    new Date()
  ]]);
}

function numericIfSafe_(value) {
  const text = clean_(value);
  if (!/^\d+$/.test(text)) return text;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : text;
}

function findWritableRow_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const storedPointer = Number(properties.getProperty(SPX_DV_CONFIG.pointerProperty) || 0);
  const storedBatchStart = Number(properties.getProperty(SPX_DV_CONFIG.batchStartProperty) || 0);

  let batchStart = Number.isInteger(storedBatchStart) && storedBatchStart >= 2
    ? storedBatchStart
    : findRowAfterLastGreen_(sheet);

  if (batchStart < 2) batchStart = 2;

  // O ponteiro serve apenas para limitar a leitura. A escolha da linha sempre
  // recomeça no início do bloco atual, então linhas apagadas são reaproveitadas.
  let scanEnd = Math.max(
    batchStart + 99,
    Number.isInteger(storedPointer) && storedPointer >= batchStart
      ? storedPointer + 50
      : batchStart + 99
  );

  while (true) {
    ensureRowExists_(sheet, scanEnd);

    const count = scanEnd - batchStart + 1;
    const backgrounds = sheet.getRange(batchStart, 1, count, 1).getBackgrounds();
    const cValues = sheet.getRange(batchStart, 3, count, 1).getDisplayValues();

    // Se uma nova linha verde foi criada depois do início conhecido do bloco,
    // tudo que está acima dela pertence ao lote encerrado e não pode ser usado.
    let latestGreenOffset = -1;
    for (let index = 0; index < backgrounds.length; index += 1) {
      if (isGreenColor_(backgrounds[index][0])) latestGreenOffset = index;
    }

    const effectiveStartOffset = latestGreenOffset >= 0
      ? latestGreenOffset + 1
      : 0;

    const effectiveBatchStart = batchStart + effectiveStartOffset;
    properties.setProperty(
      SPX_DV_CONFIG.batchStartProperty,
      String(effectiveBatchStart)
    );

    for (let index = effectiveStartOffset; index < cValues.length; index += 1) {
      if (isGreenColor_(backgrounds[index][0])) continue;

      const displayValue = String(cValues[index][0] || '').trim();
      if (!displayValue) return batchStart + index;
    }

    // Não encontrou vazio no trecho conhecido: amplia de 100 em 100 linhas.
    scanEnd += 100;
  }
}

function findRowAfterLastGreen_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 2);

  // getLastRow pode ignorar uma linha verde vazia. Por isso ampliamos a busca
  // algumas linhas abaixo do último conteúdo e, no pior caso de fórmulas até o fim,
  // lemos somente a coluna A (não a grade inteira).
  const contentLastRow = Math.max(sheet.getLastRow(), 2);
  const scanEnd = Math.min(maxRows, Math.max(contentLastRow + 50, 2));

  const backgrounds = sheet.getRange(2, 1, scanEnd - 1, 1).getBackgrounds();
  let lastGreen = 1;

  for (let index = backgrounds.length - 1; index >= 0; index -= 1) {
    if (isGreenColor_(backgrounds[index][0])) {
      lastGreen = index + 2;
      break;
    }
  }

  const batchStart = lastGreen + 1;
  PropertiesService.getScriptProperties()
    .setProperty(SPX_DV_CONFIG.batchStartProperty, String(batchStart));
  return batchStart;
}

function isGreenColor_(hex) {
  const value = String(hex || '').trim().toLowerCase();
  const match = value.match(/^#([0-9a-f]{6})$/);
  if (!match) return false;

  const number = parseInt(match[1], 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;

  // Aceita o verde forte usado como separador, com pequena tolerância.
  return green >= 180 && red <= 120 && blue <= 120 &&
    green >= red + 80 && green >= blue + 80;
}

function ensureRowExists_(sheet, row) {
  const maxRows = sheet.getMaxRows();
  if (row <= maxRows) return;
  sheet.insertRowsAfter(maxRows, Math.max(100, row - maxRows));
}

function clean_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
