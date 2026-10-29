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

const SPX_DV_BUILD = '1.3.53';

const SPX_DV_CONFIG = Object.freeze({
  spreadsheetId: '14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY',
  sheetName: 'Dados',
  controlSheetName: '_SPX_DV_CONTROLE',
  dashboardSheetName: '_SPX_DV_DASHBOARD',
  neighborhoodSheetName: '_SPX_DV_BAIRROS',
  dashboardCleanupProperty: 'SPX_DV_DASHBOARD_CLEAN_DAY_V1',
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
  batchStartProperty: 'SPX_DV_BATCH_START_V1',
  timezone: 'America/Sao_Paulo'
});

function doGet(e) {
  const view = clean_(e && e.parameter && e.parameter.view).toLowerCase();
  if (view === 'dashboard') {
    let initialData;
    try {
      initialData = getDashboardData();
    } catch (error) {
      initialData = {
        ok: false,
        today: Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd'),
        build: SPX_DV_BUILD,
        records: [],
        today_records: [],
        old_pending: [],
        error: String(error && error.message ? error.message : error)
      };
    }

    return HtmlService
      .createHtmlOutput(
        dashboardHtml_(initialData)
      )
      .setTitle('SPX-DV · Dashboard de Recebimento');
  }

  if (view === 'dashboard_data') {
    try {
      return jsonpResponse_(e, getDashboardData());
    } catch (error) {
      return jsonpResponse_(e, {
        ok: false,
        build: SPX_DV_BUILD,
        records: [],
        today_records: [],
        old_pending: [],
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  if (view === 'neighborhood') {
    return neighborhoodLookupResponse_(e);
  }

  if (view === 'geo') {
    return geoLookupResponse_(e);
  }

  if (view === 'dashboard_upsert') {
    return dashboardUpsertResponse_(e);
  }

  if (view === 'dashboard_check') {
    return dashboardCheckResponse_(e);
  }

  if (view === 'health') {
    return jsonpResponse_(e, {
      ok: true,
      service: 'SPX-DV recebimento On Hold',
      build: SPX_DV_BUILD,
      capabilities: {
        dashboard_post: true,
        dashboard_check: true,
        dashboard_data: true,
        dashboard_upsert_jsonp_legacy: true,
        geo: true
      }
    });
  }

  return jsonResponse_({
    ok: true,
    service: 'SPX-DV recebimento On Hold',
    sheet: SPX_DV_CONFIG.sheetName,
    dashboard: true
  });
}

function jsonpResponse_(e, value) {
  const callback = clean_(e && e.parameter && e.parameter.callback);
  const validCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback);
  const payloadText = JSON.stringify(value);

  if (validCallback) {
    return ContentService
      .createTextOutput(callback + '(' + payloadText + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payloadText)
    .setMimeType(ContentService.MimeType.JSON);
}

function dashboardCheckResponse_(e) {
  const occurrenceKey = clean_(e && e.parameter && e.parameter.occurrence_key);
  if (!occurrenceKey) {
    return jsonpResponse_(e, {
      ok: false,
      found: false,
      build: SPX_DV_BUILD,
      error: 'occurrence_key obrigatória'
    });
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const sheet = getDashboardSheet_(spreadsheet);
    const row = findDashboardRow_(sheet, occurrenceKey);

    if (!row) {
      return jsonpResponse_(e, {
        ok: true,
        found: false,
        build: SPX_DV_BUILD,
        occurrence_key: occurrenceKey
      });
    }

    const record = dashboardRecordFromRow_(
      sheet.getRange(row, 1, 1, 14).getValues()[0]
    );
    const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
    const effectiveDay = dashboardEffectiveDay_(record);

    return jsonpResponse_(e, {
      ok: true,
      found: true,
      build: SPX_DV_BUILD,
      occurrence_key: record.occurrenceKey,
      shipment_id: record.shipmentId,
      received_day: effectiveDay,
      source_received_day: record.receivedDay,
      today: today,
      visible_today: effectiveDay === today,
      received_at: record.receivedAt,
      status: record.status
    });
  } catch (error) {
    return jsonpResponse_(e, {
      ok: false,
      found: false,
      build: SPX_DV_BUILD,
      occurrence_key: occurrenceKey,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function dashboardUpsertResponse_(e) {
  const callback = clean_(e && e.parameter && e.parameter.callback);
  const validCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback);
  let result = {
    ok: false,
    dashboard: true,
    occurrence_key: '',
    status: '',
    error: ''
  };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) {
    return jsonpResponse_(e, {
      ok: false,
      dashboard: true,
      build: SPX_DV_BUILD,
      occurrence_key: '',
      status: '',
      error: 'busy'
    });
  }

  try {
    const raw = String(e && e.parameter && e.parameter.payload || '').trim();
    if (!raw) throw new Error('payload obrigatório');

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('payload JSON inválido');
    }

    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const dashboardSheet = getDashboardSheet_(spreadsheet);

    const dashboardRecord = enrichDashboardNeighborhood_(
      spreadsheet,
      normalizeDashboardRecord_(payload)
    );

    if (!dashboardRecord.occurrenceKey) {
      throw new Error('occurrence_key inválida');
    }

    const saved = upsertDashboardRecord_(dashboardSheet, dashboardRecord);
    SpreadsheetApp.flush();

    result = {
      ok: true,
      dashboard: true,
      occurrence_key: dashboardRecord.occurrenceKey,
      status: saved.status,
      received_day: saved.receivedDay,
      received_at: saved.receivedAt
    };
  } catch (error) {
    result.error = String(error && error.message ? error.message : error);
  } finally {
    lock.releaseLock();
  }

  const payloadText = JSON.stringify(result);
  if (validCallback) {
    return ContentService
      .createTextOutput(callback + '(' + payloadText + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payloadText)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) {
    return jsonResponse_({
      ok: false,
      busy: true,
      error: 'Dashboard ocupado; tente novamente.'
    });
  }

  try {
    const payload = parsePayload_(e);
    const action = clean_(payload && payload.action).toLowerCase();
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const dashboardSheet = getDashboardSheet_(spreadsheet);

    // Não fazemos manutenção/limpeza no caminho crítico de recebimento.
    // O upsert deve ser curto para suportar vários operadores ao mesmo tempo.
    if (action === 'dashboard_upsert') {
      const dashboardRecord = enrichDashboardNeighborhood_(
        spreadsheet,
        normalizeDashboardRecord_(payload)
      );
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
        const record = enrichDashboardNeighborhood_(
          spreadsheet,
          normalizeDashboardRecord_(item)
        );
        if (!record.occurrenceKey) return;
        upsertDashboardRecord_(dashboardSheet, record);
        merged += 1;
      });
      SpreadsheetApp.flush();
      return jsonResponse_({ ok: true, dashboard: true, merged });
    }

    if (action === 'neighborhood_import_url') {
      const result = importNeighborhoodCsvUrl_(
        spreadsheet,
        clean_(payload && payload.download_url)
      );
      SpreadsheetApp.flush();
      return jsonResponse_({
        ok: true,
        neighborhood_import: true,
        imported: result.imported,
        dashboard_updated: result.dashboardUpdated
      });
    }

    const record = normalizeRecord_(payload);

    if (!record.shipmentId) {
      return jsonResponse_({ ok: false, error: 'shipment_id obrigatório' });
    }
    if (!record.occurrenceTimestamp) {
      return jsonResponse_({ ok: false, error: 'occurrence_timestamp obrigatório' });
    }

    // Compatibilidade com módulos antigos: POST sem action NÃO grava mais em Dados.
    // Apenas mantém/atualiza a ficha na fila central. A gravação em Dados ocorre
    // exclusivamente pelo botão "Enviar X para a planilha" do Dashboard.
    const dashboardRecord = enrichDashboardNeighborhood_(
      spreadsheet,
      normalizeDashboardRecord_(payload)
    );
    if (dashboardRecord.occurrenceKey) {
      upsertDashboardRecord_(dashboardSheet, dashboardRecord);
    }
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      queued: true,
      dashboard: true,
      occurrence_key: dashboardRecord.occurrenceKey
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

function getNeighborhoodSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.neighborhoodSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SPX_DV_CONFIG.neighborhoodSheetName);
    sheet.getRange(1, 1, 1, 3).setValues([[
      'shipment_id',
      'neighborhood',
      'updated_at'
    ]]);
    sheet.setFrozenRows(1);
  }

  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function lookupNeighborhood_(spreadsheet, shipmentId) {
  const shipment = clean_(shipmentId).toUpperCase();
  if (!shipment) return '';

  const sheet = getNeighborhoodSheet_(spreadsheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';

  const match = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(shipment)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) return '';
  return clean_(sheet.getRange(match.getRow(), 2).getDisplayValue());
}

function enrichDashboardNeighborhood_(spreadsheet, record) {
  if (!record || record.neighborhood) return record;
  if (clean_(record.flow).toLowerCase().indexOf('return') === 0) return record;

  const neighborhood = lookupNeighborhood_(spreadsheet, record.shipmentId);
  if (!neighborhood) return record;

  record.neighborhood = neighborhood;
  return record;
}

function neighborhoodLookupResponse_(e) {
  const shipmentId = clean_(e && e.parameter && e.parameter.shipment_id).toUpperCase();
  const callback = clean_(e && e.parameter && e.parameter.callback);
  const validCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback);

  const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
  const neighborhood = lookupNeighborhood_(spreadsheet, shipmentId);
  const payload = JSON.stringify({
    ok: true,
    shipment_id: shipmentId,
    neighborhood: neighborhood
  });

  if (validCallback) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}


function geoLookupResponse_(e) {
  const callback = clean_(e && e.parameter && e.parameter.callback);
  const validCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback);
  const latitude = Number(e && e.parameter && e.parameter.lat);
  const longitude = Number(e && e.parameter && e.parameter.lng);

  let result = {
    ok: false,
    neighborhood: '',
    candidates: [],
    error: ''
  };

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (latitude === 0 && longitude === 0)) {
    result.error = 'Coordenadas inválidas';
  } else {
    try {
      result = reverseGeocodeNeighborhood_(latitude, longitude);
    } catch (error) {
      result = {
        ok: false,
        neighborhood: '',
        candidates: [],
        error: String(error && error.message ? error.message : error)
      };
    }
  }

  const payload = JSON.stringify(result);
  if (validCallback) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function reverseGeocodeNeighborhood_(latitude, longitude) {
  // Para Bairro, precisão de ~1 metro é mais do que suficiente e evita
  // trabalhar com coordenadas excessivamente precisas. O resultado do geocoder
  // não é persistido/cacheado pelo SPX-DV.
  const lat = Math.round(Number(latitude) * 100000) / 100000;
  const lng = Math.round(Number(longitude) * 100000) / 100000;

  const response = Maps
    .newGeocoder()
    .setLanguage('pt-BR')
    .setRegion('br')
    .reverseGeocode(lat, lng);

  const results = response && Array.isArray(response.results)
    ? response.results
    : [];

  const priorities = {
    sublocality_level_1: 0,
    neighborhood: 1,
    sublocality: 2,
    administrative_area_level_4: 3,
    administrative_area_level_3: 4
  };

  const candidates = [];
  const seen = {};

  results.slice(0, 10).forEach(function(result, resultIndex) {
    const components = result && Array.isArray(result.address_components)
      ? result.address_components
      : [];

    components.forEach(function(component) {
      const name = clean_(component && component.long_name);
      const types = component && Array.isArray(component.types)
        ? component.types
        : [];

      types.forEach(function(type) {
        if (!Object.prototype.hasOwnProperty.call(priorities, type) || !name) return;
        const key = type + '|' + name.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        candidates.push({
          name: name,
          type: type,
          result_index: resultIndex,
          score: priorities[type] * 100 + resultIndex
        });
      });
    });
  });

  candidates.sort(function(a, b) {
    return Number(a.score || 0) - Number(b.score || 0);
  });

  const cleanedCandidates = candidates.slice(0, 12).map(function(item) {
    return {
      name: item.name,
      type: item.type,
      result_index: item.result_index
    };
  });

  const neighborhood = cleanedCandidates.length
    ? clean_(cleanedCandidates[0].name)
    : '';

  return {
    ok: true,
    neighborhood: neighborhood,
    candidates: cleanedCandidates,
    source: 'apps_script_maps'
  };
}

function importNeighborhoodCsvUrl_(spreadsheet, downloadUrl) {
  const url = clean_(downloadUrl);
  if (!/^https:\/\/[A-Za-z0-9.-]*\.susercontent\.com\//i.test(url)) {
    throw new Error('URL de exportação de Bairro inválida');
  }

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  const status = Number(response.getResponseCode() || 0);
  if (status < 200 || status >= 300) {
    throw new Error('Falha ao baixar exportação de Bairro (HTTP ' + status + ')');
  }

  const csvText = response.getContentText('UTF-8');
  const rows = Utilities.parseCsv(csvText);
  if (!rows.length) throw new Error('Exportação de Bairro vazia');

  const headers = rows[0].map(value =>
    clean_(value).replace(/^\uFEFF/, '').toLowerCase()
  );
  const trackingIndex = headers.indexOf('sls tracking number');
  const orderIndex = headers.indexOf('order id');
  const neighborhoodIndex = headers.indexOf('sort code name');

  if (neighborhoodIndex < 0 || (trackingIndex < 0 && orderIndex < 0)) {
    throw new Error('Colunas Order ID/SLS Tracking Number/Sort Code Name não encontradas');
  }

  const importedMap = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const shipmentId = clean_(
      trackingIndex >= 0 && row[trackingIndex]
        ? row[trackingIndex]
        : orderIndex >= 0 ? row[orderIndex] : ''
    ).toUpperCase();
    const neighborhood = clean_(row[neighborhoodIndex]);
    if (!/^BR[A-Z0-9]{8,}$/i.test(shipmentId) || !neighborhood) continue;
    importedMap.set(shipmentId, neighborhood);
  }

  if (!importedMap.size) throw new Error('Nenhum Bairro válido encontrado na exportação');

  const sheet = getNeighborhoodSheet_(spreadsheet);
  const existing = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 3).getValues().forEach(row => {
      const shipmentId = clean_(row[0]).toUpperCase();
      const neighborhood = clean_(row[1]);
      const updatedAt = Number(row[2] || 0);
      if (shipmentId && neighborhood) existing.set(shipmentId, [neighborhood, updatedAt]);
    });
  }

  const now = Date.now();
  importedMap.forEach((neighborhood, shipmentId) => {
    existing.set(shipmentId, [neighborhood, now]);
  });

  const values = [...existing.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([shipmentId, value]) => [shipmentId, value[0], value[1]]);

  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  }
  if (values.length) {
    sheet.getRange(2, 1, values.length, 3).setValues(values);
  }

  const dashboardSheet = getDashboardSheet_(spreadsheet);
  const dashboardLastRow = dashboardSheet.getLastRow();
  let dashboardUpdated = 0;

  if (dashboardLastRow >= 2) {
    const dashboardValues = dashboardSheet.getRange(2, 1, dashboardLastRow - 1, 14).getValues();
    dashboardValues.forEach((row, index) => {
      const shipmentId = clean_(row[3]).toUpperCase();
      const currentNeighborhood = clean_(row[8]);
      const flow = clean_(row[10]).toLowerCase();
      if (!shipmentId || currentNeighborhood || flow.indexOf('return') === 0) return;

      const neighborhood = importedMap.get(shipmentId) || lookupNeighborhood_(spreadsheet, shipmentId);
      if (!neighborhood) return;

      dashboardSheet.getRange(index + 2, 9).setValue(neighborhood);
      dashboardSheet.getRange(index + 2, 14).setValue(Date.now());
      dashboardUpdated += 1;
    });
  }

  return {
    imported: importedMap.size,
    dashboardUpdated: dashboardUpdated
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

function normalizeDashboardDay_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  }

  if (typeof value === 'number' && isFinite(value) && value > 0) {
    // Fallback para serial de data do Google Sheets/Excel.
    const base = Date.UTC(1899, 11, 30);
    const date = new Date(base + Math.round(value * 86400000));
    return Utilities.formatDate(date, SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  }

  const text = clean_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  }

  return text;
}

function dashboardRecordFromRow_(values) {
  return {
    occurrenceKey: clean_(values[0]),
    receivedDay: normalizeDashboardDay_(values[1]),
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
      const day = normalizeDashboardDay_(values[index][1]);
      const status = clean_(values[index][12]).toLowerCase();
      if (day && day !== today && status === 'confirmed') {
        sheet.deleteRow(index + 2);
      }
    }
  }

  properties.setProperty(SPX_DV_CONFIG.dashboardCleanupProperty, today);
}

function reconcileDashboardStatuses_(spreadsheet, dashboardSheet) {
  const controlSheet = getControlSheet_(spreadsheet);
  const controlLastRow = controlSheet.getLastRow();
  if (controlLastRow < 2) return 0;

  const recordedKeys = new Set(
    controlSheet.getRange(2, 1, controlLastRow - 1, 1)
      .getDisplayValues()
      .map(row => clean_(row[0]))
      .filter(Boolean)
  );

  const dashboardLastRow = dashboardSheet.getLastRow();
  if (dashboardLastRow < 2) return 0;

  const values = dashboardSheet.getRange(2, 1, dashboardLastRow - 1, 14).getValues();
  let changed = 0;

  values.forEach((row, index) => {
    const occurrenceKey = clean_(row[0]);
    const status = clean_(row[12]).toLowerCase();
    if (!occurrenceKey || status === 'confirmed') return;
    if (!recordedKeys.has(occurrenceKey)) return;

    dashboardSheet.getRange(index + 2, 13, 1, 2).setValues([[
      'confirmed',
      Date.now()
    ]]);
    changed += 1;
  });

  if (changed) SpreadsheetApp.flush();
  return changed;
}

function dashboardEffectiveDay_(record) {
  const receivedAt = Number(record && record.receivedAt || 0);
  if (receivedAt > 0) {
    const fromReceivedAt = Utilities.formatDate(
      new Date(receivedAt),
      SPX_DV_CONFIG.timezone,
      'yyyy-MM-dd'
    );
    if (fromReceivedAt) return fromReceivedAt;
  }
  return normalizeDashboardDay_(record && record.receivedDay);
}

function dashboardClientRecord_(record) {
  return {
    occurrence_key: record.occurrenceKey,
    received_day: dashboardEffectiveDay_(record),
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
  };
}

function getDashboardData() {
  // Leitura somente: não usa ScriptLock e não faz limpeza/reconciliação.
  // O servidor já classifica "hoje" para a tela não depender de comparar
  // datas vindas do Sheets no navegador.
  const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
  const sheet = getDashboardSheet_(spreadsheet);

  const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  const lastRow = sheet.getLastRow();
  const source = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 14).getValues().map(dashboardRecordFromRow_)
    : [];

  const records = source.map(dashboardClientRecord_);
  const todayRecords = records
    .filter(record => record.received_day === today)
    .sort((a, b) => Number(b.received_at || 0) - Number(a.received_at || 0));
  const oldPending = records
    .filter(record =>
      record.received_day &&
      record.received_day !== today &&
      record.status !== 'confirmed'
    )
    .sort((a, b) => Number(b.received_at || 0) - Number(a.received_at || 0));

  return {
    ok: true,
    today,
    build: SPX_DV_BUILD,
    server_time: Date.now(),
    source_rows: source.length,
    today_count: todayRecords.length,
    old_pending_count: oldPending.length,
    records,
    today_records: todayRecords,
    old_pending: oldPending
  };
}

function sendPendingDashboardToData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const dashboardSheet = getDashboardSheet_(spreadsheet);
    const dataSheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName);
    if (!dataSheet) throw new Error('Aba Dados não encontrada');

    cleanupOldConfirmedDashboard_(dashboardSheet);
    reconcileDashboardStatuses_(spreadsheet, dashboardSheet);

    const lastRow = dashboardSheet.getLastRow();
    if (lastRow < 2) {
      return { ok: true, pending: 0, sent: 0, duplicates: 0, failed: 0 };
    }

    const rows = dashboardSheet.getRange(2, 1, lastRow - 1, 14).getValues();
    const pending = rows
      .map((values, index) => ({ index: index + 2, record: dashboardRecordFromRow_(values) }))
      .filter(item => item.record.status !== 'confirmed')
      .sort((a, b) => Number(a.record.receivedAt || 0) - Number(b.record.receivedAt || 0));

    const controlSheet = getControlSheet_(spreadsheet);
    let sent = 0;
    let duplicates = 0;
    let failed = 0;
    const errors = [];

    pending.forEach(item => {
      try {
        const dashboardRecord = item.record;
        if (!dashboardRecord.shipmentId || !dashboardRecord.occurrenceTimestamp) {
          throw new Error('Ficha incompleta');
        }

        if (!dashboardRecord.neighborhood &&
            clean_(dashboardRecord.flow).toLowerCase().indexOf('return') !== 0) {
          dashboardRecord.neighborhood = lookupNeighborhood_(spreadsheet, dashboardRecord.shipmentId);
          if (dashboardRecord.neighborhood) {
            dashboardSheet.getRange(item.index, 9).setValue(dashboardRecord.neighborhood);
          }
        }

        const occurrenceKey = dashboardRecord.occurrenceKey ||
          dashboardRecord.shipmentId + '|' + dashboardRecord.occurrenceTimestamp;

        if (occurrenceAlreadyRecorded_(controlSheet, occurrenceKey)) {
          dashboardSheet.getRange(item.index, 13, 1, 2).setValues([[
            'confirmed',
            Date.now()
          ]]);
          duplicates += 1;
          return;
        }

        const record = normalizeRecord_({
          shipment_id: dashboardRecord.shipmentId,
          reason: dashboardRecord.reason,
          driver_id: dashboardRecord.driverId,
          driver_name: dashboardRecord.driverName,
          agency: dashboardRecord.agency,
          neighborhood: dashboardRecord.neighborhood,
          occurrence_timestamp: dashboardRecord.occurrenceTimestamp,
          flow: dashboardRecord.flow
        });

        const row = findWritableRow_(dataSheet);
        writeRecord_(dataSheet, row, record);
        SpreadsheetApp.flush();

        const writtenShipment = clean_(dataSheet.getRange(row, 3).getDisplayValue()).toUpperCase();
        if (writtenShipment !== record.shipmentId) {
          throw new Error('Falha ao confirmar gravação na linha ' + row);
        }

        rememberOccurrence_(controlSheet, occurrenceKey, row);
        dashboardSheet.getRange(item.index, 13, 1, 2).setValues([[
          'confirmed',
          Date.now()
        ]]);

        PropertiesService.getScriptProperties()
          .setProperty(SPX_DV_CONFIG.pointerProperty, String(row + 1));

        sent += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          occurrence_key: item.record.occurrenceKey,
          shipment_id: item.record.shipmentId,
          error: String(error && error.message ? error.message : error)
        });
      }
    });

    SpreadsheetApp.flush();

    return {
      ok: failed === 0,
      pending: pending.length,
      sent: sent,
      duplicates: duplicates,
      failed: failed,
      errors: errors.slice(0, 20)
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
      const day = normalizeDashboardDay_(values[index][1]);
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

function dashboardHtmlEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dashboardFormatMillis_(value) {
  const number = Number(value || 0);
  if (!number) return '-';
  return Utilities.formatDate(
    new Date(number),
    SPX_DV_CONFIG.timezone,
    'dd/MM/yyyy HH:mm:ss'
  );
}

function dashboardFormatSeconds_(value) {
  const number = Number(value || 0);
  if (!number) return '-';
  return Utilities.formatDate(
    new Date(number * 1000),
    SPX_DV_CONFIG.timezone,
    'dd/MM/yyyy HH:mm:ss'
  );
}

function dashboardTopDriversHtml_(records) {
  const drivers = new Map();

  (Array.isArray(records) ? records : []).forEach(function(record) {
    const id = clean_(record && record.driver_id);
    const name = clean_(record && record.driver_name);
    if (!id && !name) return;

    const key = id || name.toLowerCase();
    const agency = clean_(record && record.agency);
    const reason = clean_(record && record.reason) || 'Sem motivo informado';
    const item = drivers.get(key) || {
      id: id,
      name: name || 'Motorista não identificado',
      agency: agency,
      count: 0,
      reasons: new Map()
    };

    item.count += 1;
    if (!item.agency && agency) item.agency = agency;
    item.reasons.set(reason, Number(item.reasons.get(reason) || 0) + 1);
    drivers.set(key, item);
  });

  const top = Array.from(drivers.values())
    .sort(function(a, b) {
      return b.count - a.count || a.name.localeCompare(b.name, 'pt-BR');
    })
    .slice(0, 10);

  if (!top.length) {
    return '<div class="empty">Ainda não há motoristas para o ranking de hoje.</div>';
  }

  const reasonTotals = new Map();
  top.forEach(function(driver) {
    driver.reasons.forEach(function(count, reason) {
      if (count > 0) {
        reasonTotals.set(reason, Number(reasonTotals.get(reason) || 0) + count);
      }
    });
  });

  const visibleReasons = Array.from(reasonTotals.entries())
    .filter(function(entry) { return entry[1] > 0; })
    .sort(function(a, b) {
      return b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR');
    })
    .map(function(entry) { return entry[0]; });

  const headReasons = visibleReasons.map(function(reason) {
    return '<th class="reason-head"><span>' +
      dashboardHtmlEscape_(reason) +
      '</span></th>';
  }).join('');

  const body = top.map(function(driver, index) {
    const reasonCells = visibleReasons.map(function(reason) {
      const count = Number(driver.reasons.get(reason) || 0);
      return '<td class="' + (count > 0 ? 'reason-count' : 'reason-zero') + '">' +
        (count > 0 ? count : '') +
        '</td>';
    }).join('');

    return '<tr>' +
      '<td class="rank-col"><span class="rank-number">' + (index + 1) + '</span></td>' +
      '<td class="driver-col"><span class="rank-driver-name">' +
        dashboardHtmlEscape_(driver.name) +
        '</span><span class="rank-driver-id">ID: ' +
        dashboardHtmlEscape_(driver.id || 'Não informado') +
        '</span></td>' +
      '<td class="agency-col">' +
        dashboardHtmlEscape_(driver.agency || 'Não informado') +
        '</td>' +
      '<td class="total-col">' + driver.count + '</td>' +
      reasonCells +
      '</tr>';
  }).join('');

  return '<table class="ranking-table"><thead><tr>' +
    '<th class="rank-col">Ranking</th>' +
    '<th class="driver-col">Driver</th>' +
    '<th class="agency-col">3PL</th>' +
    '<th class="total-col">Total</th>' +
    headReasons +
    '</tr></thead><tbody>' + body + '</tbody></table>';
}

function dashboardHtml_(initialData) {
  const data = initialData && typeof initialData === 'object'
    ? initialData
    : {
        ok: false,
        build: SPX_DV_BUILD,
        records: [],
        today_records: [],
        old_pending: [],
        error: 'Dashboard sem estado inicial'
      };

  const records = Array.isArray(data.records) ? data.records : [];
  const todayRecords = Array.isArray(data.today_records)
    ? data.today_records
    : records.filter(function(record) {
        return clean_(record && record.received_day) === clean_(data.today);
      });
  const oldPending = Array.isArray(data.old_pending)
    ? data.old_pending
    : records.filter(function(record) {
        return clean_(record && record.received_day) &&
          clean_(record.received_day) !== clean_(data.today) &&
          clean_(record.status).toLowerCase() !== 'confirmed';
      });
  const pendingToday = todayRecords.filter(function(record) {
    return clean_(record && record.status).toLowerCase() !== 'confirmed';
  });
  const confirmedToday = todayRecords.filter(function(record) {
    return clean_(record && record.status).toLowerCase() === 'confirmed';
  });
  const allPending = records.filter(function(record) {
    return clean_(record && record.status).toLowerCase() !== 'confirmed';
  });

  const operatorCounts = {};
  todayRecords.forEach(function(record) {
    const login = clean_(record && record.operator_login).toLowerCase();
    if (!login) return;
    operatorCounts[login] = Number(operatorCounts[login] || 0) + 1;
  });

  const sortedToday = todayRecords.slice().sort(function(a, b) {
    return Number(b && b.received_at || 0) - Number(a && a.received_at || 0);
  });

  const serverRowsHtml = sortedToday.map(function(record) {
    return '<tr>' +
      '<td>' + dashboardHtmlEscape_(dashboardFormatMillis_(record.received_at)) + '</td>' +
      '<td><strong>' + dashboardHtmlEscape_(record.shipment_id) + '</strong></td>' +
      '<td>' + dashboardHtmlEscape_(record.reason) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.driver_id) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.driver_name) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.agency) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.neighborhood) + '</td>' +
      '<td>' + dashboardHtmlEscape_(dashboardFormatSeconds_(record.occurrence_timestamp)) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.operator_login || 'Não identificado') + '</td>' +
      '</tr>';
  }).join('');

  const serverOperatorOptions = Object.keys(operatorCounts)
    .sort()
    .map(function(login) {
      return '<option value="' + dashboardHtmlEscape_(login) + '" data-count="' +
        operatorCounts[login] + '">' +
        dashboardHtmlEscape_(login) + ' (' + operatorCounts[login] + ')' +
        '</option>';
    })
    .join('');

  const serverTopDriversHtml = dashboardTopDriversHtml_(todayRecords);
  const serverBuildInfo =
    'servidor ' + SPX_DV_BUILD +
    ' · base ' + records.length +
    ' · hoje ' + todayRecords.length;

  const serverWarningHtml = data.ok === false && data.error
    ? '<div class="warning">Falha ao carregar dados do Dashboard: ' +
        dashboardHtmlEscape_(data.error) +
      '</div>'
    : (oldPending.length
        ? '<div class="warning">⚠ ' + oldPending.length +
          ' pendência(s) de dias anteriores.</div>'
        : '');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SPX-DV · Dashboard</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#020202;color:#f8fafc;font:13px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}main{max-width:1600px;margin:auto;padding:26px 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:16px 18px;border:1px solid #4a260f;border-radius:14px;background:#070707;box-shadow:0 0 22px rgba(249,115,22,.16),inset 0 -1px rgba(249,115,22,.3)}h1{font-size:27px;letter-spacing:-.5px;margin:0;text-shadow:0 0 16px rgba(249,115,22,.34)}h2{font-size:16px;margin:0;color:#fff7ed;text-shadow:0 0 11px rgba(249,115,22,.26)}.muted{color:#9ca3af}.actions,.filters{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
button,select,input{font:inherit}button{background:#111;color:#fff;border:1px solid #6b3415;border-radius:9px;padding:10px 14px;cursor:pointer;font-weight:750;box-shadow:0 0 12px rgba(249,115,22,.1)}button:hover{background:#1a0d07;border-color:#f97316}button:disabled{opacity:.45;cursor:not-allowed}button.danger{color:#fed7aa}button.primary{background:#f97316;border-color:#fb923c;color:#140800;box-shadow:0 0 18px rgba(249,115,22,.24)}button.primary:hover{background:#fb923c}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric,.panel{background:#080808;border:1px solid #252525;border-radius:14px;padding:18px;box-shadow:0 10px 28px rgba(0,0,0,.42)}.metric{border-top-color:#6b3415}.metric span{display:block;font-size:11px;color:#a3a3a3;text-transform:uppercase;letter-spacing:.45px}.metric strong{display:block;font-size:28px;margin-top:5px}
.panel{margin-bottom:16px}.panel-head{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:-18px -18px 14px;padding:16px 18px 14px;background:#090603;border-bottom:1px solid #6b3415;border-radius:14px 14px 0 0;box-shadow:0 5px 18px rgba(249,115,22,.11)}
.search{width:min(390px,100%);padding:10px 12px;background:#030303;border:1px solid #3f3f46;color:#fff;border-radius:9px}.operator-filter{padding:10px 12px;background:#030303;border:1px solid #6b3415;color:#fff;border-radius:9px;min-width:280px}.filter-badge{display:inline-flex;align-items:center;min-height:38px;padding:8px 11px;border:1px solid #3f3f46;border-radius:9px;background:#050505;color:#fdba74;font-weight:800}.filter-info{font-size:12px;color:#d1d5db;white-space:nowrap}
.ranking-wrap{overflow:auto;border:1px solid #2b211b;border-radius:10px;background:#050505}.ranking-table{border-collapse:collapse;width:max-content;min-width:100%;background:#050505}.ranking-table th,.ranking-table td{border:1px solid #2a2a2a;padding:8px 10px;text-align:center;white-space:nowrap}.ranking-table thead th{position:sticky;top:0;z-index:2;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.25px}.ranking-table .rank-col{width:54px;min-width:54px}.ranking-table .driver-col{min-width:270px;text-align:left}.ranking-table .agency-col{min-width:150px;text-align:left}.ranking-table .total-col{min-width:78px;font-size:15px;font-weight:900;color:#fb923c;background:#130a05}.ranking-table .reason-head{height:132px;min-width:58px;padding:0 6px;vertical-align:bottom}.ranking-table .reason-head>span{display:inline-block;transform:rotate(-52deg);transform-origin:left bottom;white-space:nowrap;margin-left:22px;margin-bottom:10px;color:#fdba74;font-size:10px;text-transform:none;letter-spacing:0}.ranking-table tbody tr:hover{background:#100b08}.ranking-table .reason-count{font-weight:900;color:#f97316}.ranking-table .reason-zero{color:#4b5563}.rank-number{display:inline-grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#351a0b;color:#fdba74;font-weight:900}.rank-driver-name{font-weight:800;color:#fff}.rank-driver-id{display:block;color:#9ca3af;font-size:10px;margin-top:2px}.top-summary{cursor:pointer;list-style:none}.top-summary::-webkit-details-marker{display:none}.top-summary::after{content:'▸';display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid #6b3415;background:#0b0705;color:#fdba74;font-size:18px;font-weight:900;box-shadow:0 0 12px rgba(249,115,22,.1)}details[open]>.top-summary::after{content:'▾'}
.table-wrap{max-height:64vh;overflow:auto;border:1px solid #262626;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:1450px;background:#050505}th,td{padding:11px 12px;border-bottom:1px solid #262626;text-align:left;vertical-align:top}thead tr:first-child th{position:sticky;top:0;z-index:3;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.35px;box-shadow:inset 0 -1px #7c2d12,0 4px 14px rgba(249,115,22,.08)}.column-filters th{position:sticky;top:39px;z-index:2;background:#080503;padding:7px}.column-filter{width:100%;min-width:90px;padding:7px 8px;background:#020202;border:1px solid #3f3f46;color:#fff;border-radius:7px;font-size:11px}.column-filter::placeholder{color:#6b7280}tbody tr:hover{background:#100b08}
.warning{margin:0 0 16px;padding:11px 14px;border:1px solid #f59e0b55;border-radius:10px;background:#78350f25;color:#fde68a}.empty{padding:30px;text-align:center;color:#94a3b8}.action-status{min-height:18px;margin-top:9px;color:#fdba74;font-size:11px}footer{color:#94a3b8;font-size:11px}
@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}main{padding:14px}.operator-filter{min-width:220px}}@media(max-width:520px){.metrics{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<header><div><h1>Dashboard de Recebimento</h1><div class="muted">SPX-DV · somente recebimentos confirmados pelo SPX entram na fila · <span id="buildInfo">${dashboardHtmlEscape_(serverBuildInfo)}</span></div></div><div><div class="actions"><button id="sendPending" class="primary"${allPending.length ? '' : ' disabled'}>Enviar ${allPending.length} para a planilha</button><button id="clearConfirmed" class="danger"${confirmedToday.length ? '' : ' disabled'}>Limpar já enviados</button><button id="refresh" type="button">Atualizar</button></div><div id="actionStatus" class="action-status"></div></div></header>
<div id="warning">${serverWarningHtml}</div>
<section class="metrics">
<div class="metric"><span>Recebidos hoje</span><strong id="mTotal">${todayRecords.length}</strong></div>
<div class="metric"><span>Pendências hoje</span><strong id="mPending">${pendingToday.length}</strong></div>
<div class="metric"><span>Pendentes antigos</span><strong id="mOld">${oldPending.length}</strong></div>
<div class="metric"><span>Operadores hoje</span><strong id="mOperators">${Object.keys(operatorCounts).length}</strong></div>
</section>
<section class="panel">
<details open>
<summary class="panel-head top-summary"><div><h2>Top 10 motoristas ofensores do dia</h2><div class="muted">Matriz calculada no servidor. Clique no cabeçalho para abrir ou fechar.</div></div></summary>
<div class="ranking-wrap"><div id="topDrivers">${serverTopDriversHtml}</div></div>
</details>
</section>
<section class="panel">
<div class="panel-head"><div><h2>Recebimentos de hoje</h2><div class="muted">Filtros locais: nenhum filtro navega para script.google.com.</div></div><div class="filters"><select id="operator" class="operator-filter"><option value="" data-count="${todayRecords.length}">Todos os operadores (${todayRecords.length})</option>${serverOperatorOptions}</select><span id="operatorCount" class="filter-badge">${todayRecords.length} recebidos</span><input id="generalSearch" class="search" placeholder="Filtro geral: pedido, login, motorista, 3PL, bairro, motivo..."><button id="clearFilters" type="button">Limpar filtros</button><span id="filterInfo" class="filter-info">Mostrando ${todayRecords.length} de ${todayRecords.length}</span></div></div>
<div class="table-wrap"><table id="receiveTable"><thead><tr><th>Recebido em</th><th>Pedido</th><th>Motivo do APP</th><th>Driver ID</th><th>Motorista</th><th>Transportadora 3PL</th><th>Bairro</th><th>Data da ocorrência</th><th>Login SPX</th></tr><tr class="column-filters"><th><input class="column-filter" data-col="0" placeholder="Filtrar data"></th><th><input class="column-filter" data-col="1" placeholder="Filtrar pedido"></th><th><input class="column-filter" data-col="2" placeholder="Filtrar motivo"></th><th><input class="column-filter" data-col="3" placeholder="Filtrar ID"></th><th><input class="column-filter" data-col="4" placeholder="Filtrar motorista"></th><th><input class="column-filter" data-col="5" placeholder="Filtrar 3PL"></th><th><input class="column-filter" data-col="6" placeholder="Filtrar bairro"></th><th><input class="column-filter" data-col="7" placeholder="Filtrar ocorrência"></th><th><input class="column-filter" data-col="8" placeholder="Filtrar login"></th></tr></thead><tbody id="rows">${serverRowsHtml}</tbody></table><div id="empty" class="empty"${todayRecords.length ? ' hidden' : ''}>Nenhum recebimento corresponde aos filtros.</div></div>
</section>
<footer>Recebimentos confirmados pelo SPX ficam na fila até o envio explícito para Dados. Pendências antigas nunca são apagadas automaticamente.</footer>
</main>
<script>
(function(){
  'use strict';

  function byId(id){ return document.getElementById(id); }
  function normalize(value){
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g,'')
      .trim();
  }

  function rows(){
    return Array.prototype.slice.call(document.querySelectorAll('#rows tr'));
  }

  function selectedOperatorCount(){
    var select=byId('operator');
    if(!select || select.selectedIndex < 0) return 0;
    var option=select.options[select.selectedIndex];
    return Number(option && option.getAttribute('data-count') || 0);
  }

  function applyFilters(){
    try{
      var operator=normalize(byId('operator') && byId('operator').value);
      var general=normalize(byId('generalSearch') && byId('generalSearch').value);
      var columnInputs=Array.prototype.slice.call(document.querySelectorAll('.column-filter'));
      var columnFilters={};
      columnInputs.forEach(function(input){
        columnFilters[Number(input.getAttribute('data-col'))]=normalize(input.value);
      });

      var allRows=rows();
      var visible=0;
      allRows.forEach(function(row){
        var cells=Array.prototype.slice.call(row.cells || []);
        var cellTexts=cells.map(function(cell){ return normalize(cell.textContent); });
        var rowText=cellTexts.join(' ');
        var login=cellTexts[8] || '';

        var ok=(!operator || login === operator) && (!general || rowText.indexOf(general) >= 0);
        if(ok){
          Object.keys(columnFilters).some(function(key){
            var filter=columnFilters[key];
            if(filter && (cellTexts[Number(key)] || '').indexOf(filter) < 0){
              ok=false;
              return true;
            }
            return false;
          });
        }

        row.hidden=!ok;
        if(ok) visible+=1;
      });

      var total=allRows.length;
      var info=byId('filterInfo');
      if(info) info.textContent='Mostrando '+visible+' de '+total;
      var badge=byId('operatorCount');
      if(badge){
        var count=operator ? selectedOperatorCount() : total;
        badge.textContent=count+' recebido'+(count===1?'':'s');
      }
      var empty=byId('empty');
      if(empty) empty.hidden=visible>0;
    }catch(error){
      var status=byId('actionStatus');
      if(status) status.textContent='Filtro indisponível: '+String(error && error.message || error);
    }
  }

  function clearFilters(){
    var operator=byId('operator');
    var general=byId('generalSearch');
    if(operator) operator.value='';
    if(general) general.value='';
    Array.prototype.slice.call(document.querySelectorAll('.column-filter')).forEach(function(input){
      input.value='';
    });
    applyFilters();
  }

  function setStatus(message){
    var el=byId('actionStatus');
    if(el) el.textContent=String(message || '');
  }

  function bindActionButtons(){
    var refresh=byId('refresh');
    if(refresh){
      refresh.addEventListener('click',function(){
        setStatus('Atualizando...');
        window.location.reload();
      });
    }

    var send=byId('sendPending');
    if(send){
      send.addEventListener('click',function(){
        var count=Number('${allPending.length}');
        if(!count){ alert('Não há registros na fila para enviar.'); return; }
        if(!confirm('Enviar '+count+' registro(s) da fila para a aba Dados?')) return;
        if(!(window.google && google.script && google.script.run)){
          setStatus('Ação indisponível nesta página.');
          return;
        }
        send.disabled=true;
        setStatus('Enviando para Dados...');
        google.script.run
          .withSuccessHandler(function(result){
            var sent=Number(result && result.sent || 0);
            var duplicates=Number(result && result.duplicates || 0);
            var failed=Number(result && result.failed || 0);
            setStatus('Concluído: '+sent+' gravados, '+duplicates+' já existentes, '+failed+' falhas.');
            alert('Envio concluído.\\nGravados: '+sent+'\\nJá existentes: '+duplicates+'\\nFalhas: '+failed);
            window.location.reload();
          })
          .withFailureHandler(function(error){
            send.disabled=false;
            setStatus('Falha no envio: '+String(error && error.message || error));
          })
          .sendPendingDashboardToData();
      });
    }

    var clear=byId('clearConfirmed');
    if(clear){
      clear.addEventListener('click',function(){
        var count=Number('${confirmedToday.length}');
        if(!count){ alert('Não há registros já enviados para limpar hoje.'); return; }
        if(!confirm('Limpar '+count+' registro(s) já enviado(s) de hoje?\\n\\nPendências não serão apagadas.')) return;
        if(!(window.google && google.script && google.script.run)){
          setStatus('Ação indisponível nesta página.');
          return;
        }
        clear.disabled=true;
        setStatus('Limpando registros já enviados...');
        google.script.run
          .withSuccessHandler(function(result){
            var removed=Number(result && result.removed || 0);
            setStatus('Limpeza concluída: '+removed+' removidos.');
            window.location.reload();
          })
          .withFailureHandler(function(error){
            clear.disabled=false;
            setStatus('Falha na limpeza: '+String(error && error.message || error));
          })
          .clearConfirmedDashboard();
      });
    }
  }

  try{
    var operator=byId('operator');
    var general=byId('generalSearch');
    var clearFiltersButton=byId('clearFilters');
    if(operator) operator.addEventListener('change',applyFilters);
    if(general) general.addEventListener('input',applyFilters);
    Array.prototype.slice.call(document.querySelectorAll('.column-filter')).forEach(function(input){
      input.addEventListener('input',applyFilters);
    });
    if(clearFiltersButton) clearFiltersButton.addEventListener('click',clearFilters);
    bindActionButtons();
    applyFilters();
  }catch(error){
    setStatus('Falha ao iniciar controles: '+String(error && error.message || error));
  }
})();
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
