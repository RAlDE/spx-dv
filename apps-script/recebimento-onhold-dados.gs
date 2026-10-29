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

const SPX_DV_BUILD = '1.3.47';

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
    return HtmlService
      .createHtmlOutput(dashboardHtml_())
      .setTitle('SPX-DV · Dashboard de Recebimento');
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

    return jsonpResponse_(e, {
      ok: true,
      found: true,
      build: SPX_DV_BUILD,
      occurrence_key: record.occurrenceKey,
      shipment_id: record.shipmentId,
      received_day: record.receivedDay,
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

function getDashboardData() {
  // Leitura somente: não usa ScriptLock e não faz limpeza/reconciliação.
  // Assim o polling do Dashboard não bloqueia os upserts dos operadores.
  const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
  const sheet = getDashboardSheet_(spreadsheet);

  const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
  const lastRow = sheet.getLastRow();
  const records = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 14).getValues().map(dashboardRecordFromRow_)
    : [];

  return {
    ok: true,
    today,
    build: SPX_DV_BUILD,
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
button,select,input{font:inherit}button{background:#111;color:#fff;border:1px solid #6b3415;border-radius:9px;padding:10px 14px;cursor:pointer;font-weight:750;box-shadow:0 0 12px rgba(249,115,22,.1)}button:hover{background:#1a0d07;border-color:#f97316}button:disabled{opacity:.45;cursor:not-allowed}button.danger{color:#fed7aa}button.primary{background:#f97316;border-color:#fb923c;color:#140800;box-shadow:0 0 18px rgba(249,115,22,.24)}button.primary:hover{background:#fb923c}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric,.panel{background:#080808;border:1px solid #252525;border-radius:14px;padding:18px;box-shadow:0 10px 28px rgba(0,0,0,.42)}.metric{border-top-color:#6b3415}.metric.clickable{cursor:pointer}.metric.clickable:hover,.metric.clickable.active{border-color:#f97316;box-shadow:0 0 20px rgba(249,115,22,.18),0 10px 28px rgba(0,0,0,.42)}.metric span{display:block;font-size:11px;color:#a3a3a3;text-transform:uppercase;letter-spacing:.45px}.metric strong{display:block;font-size:28px;margin-top:5px}
.panel{margin-bottom:16px}.panel-head{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:-18px -18px 14px;padding:16px 18px 14px;background:#090603;border-bottom:1px solid #6b3415;border-radius:14px 14px 0 0;box-shadow:0 5px 18px rgba(249,115,22,.11)}
.search{width:min(360px,100%);padding:10px 12px;background:#030303;border:1px solid #3f3f46;color:#fff;border-radius:9px}.operator-filter{padding:10px 12px;background:#030303;border:1px solid #6b3415;color:#fff;border-radius:9px;min-width:210px}
.ranking-wrap{overflow:auto;border:1px solid #2b211b;border-radius:10px;background:#050505}.ranking-table{border-collapse:collapse;width:max-content;min-width:100%;background:#050505}.ranking-table th,.ranking-table td{border:1px solid #2a2a2a;padding:8px 10px;text-align:center;white-space:nowrap}.ranking-table thead th{position:sticky;top:0;z-index:2;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.25px}.ranking-table .rank-col{width:54px;min-width:54px}.ranking-table .driver-col{min-width:270px;text-align:left}.ranking-table .agency-col{min-width:150px;text-align:left}.ranking-table .total-col{min-width:78px;font-size:15px;font-weight:900;color:#fb923c;background:#130a05}.ranking-table .reason-head{height:132px;min-width:58px;padding:0 6px;vertical-align:bottom}.ranking-table .reason-head>span{display:inline-block;transform:rotate(-52deg);transform-origin:left bottom;white-space:nowrap;margin-left:22px;margin-bottom:10px;color:#fdba74;font-size:10px;text-transform:none;letter-spacing:0}.ranking-table tbody tr:hover{background:#100b08}.ranking-table .reason-count{font-weight:900;color:#f97316}.ranking-table .reason-zero{color:#4b5563}.rank-number{display:inline-grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#351a0b;color:#fdba74;font-weight:900}.rank-driver-name{font-weight:800;color:#fff}.rank-driver-id{display:block;color:#9ca3af;font-size:10px;margin-top:2px}.rank-toggle{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid #6b3415;background:#0b0705;color:#fdba74;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 0 12px rgba(249,115,22,.1)}.rank-toggle:hover{border-color:#f97316;background:#1a0d07}.ranking-collapsed{display:none}
.table-wrap{max-height:64vh;overflow:auto;border:1px solid #262626;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:1450px;background:#050505}th,td{padding:11px 12px;border-bottom:1px solid #262626;text-align:left;vertical-align:top}th{position:sticky;top:0;z-index:1;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.35px;box-shadow:inset 0 -1px #7c2d12,0 4px 14px rgba(249,115,22,.08)}tbody tr:hover{background:#100b08}
.status{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f59e0b2c;color:#fde68a;font-size:11px;font-weight:800}.status.confirmed{background:#16a34a2c;color:#bbf7d0}.warning{margin:0 0 16px;padding:11px 14px;border:1px solid #f59e0b55;border-radius:10px;background:#78350f25;color:#fde68a}.empty{padding:30px;text-align:center;color:#94a3b8}footer{color:#94a3b8;font-size:11px}
@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}main{padding:14px}}@media(max-width:520px){.metrics{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<header><div><h1>Dashboard de Recebimento</h1><div class="muted">SPX-DV · somente recebimentos confirmados pelo SPX entram na fila</div></div><div class="actions"><button id="sendPending" class="primary">Enviar 0 para a planilha</button><button id="clearConfirmed" class="danger">Limpar já enviados</button><button id="refresh">Atualizar</button></div></header>
<div id="warning"></div>
<section class="metrics">
<div class="metric clickable active" id="cardToday"><span>Recebidos hoje</span><strong id="mTotal">0</strong></div>
<div class="metric clickable" id="cardPending"><span>Pendências</span><strong id="mPending">0</strong></div>
<div class="metric clickable" id="cardOld"><span>Pendentes antigos</span><strong id="mOld">0</strong></div>
<div class="metric"><span>Operadores hoje</span><strong id="mOperators">0</strong></div>
</section>
<section class="panel">
<div class="panel-head"><div><h2>Top 10 motoristas ofensores do dia</h2><div class="muted">Matriz por motorista e ocorrência. Só aparecem motivos com quantidade no Top 10.</div></div><button id="toggleTopDrivers" class="rank-toggle" title="Abrir/fechar Top 10" aria-label="Abrir/fechar Top 10">▾</button></div>
<div id="topDriversWrap" class="ranking-wrap"><div id="topDrivers"></div></div>
</section>
<section class="panel">
<div class="panel-head"><div><h2 id="tableTitle">Recebimentos de hoje</h2><div id="tableSubtitle" class="muted">Todos os logins e computadores aparecem nesta mesma fila central.</div></div><div class="filters"><select id="operator" class="operator-filter"><option value="">Todos os operadores</option></select><input id="search" class="search" placeholder="Pesquisar pedido, login, motorista, 3PL, bairro ou motivo"></div></div>
<div class="table-wrap"><table><thead><tr><th>Recebido em</th><th>Pedido</th><th>Motivo do APP</th><th>Driver ID</th><th>Motorista</th><th>Transportadora 3PL</th><th>Bairro</th><th>Data da ocorrência</th><th>Login SPX</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty" hidden>Nenhum recebimento.</div></div>
</section>
<footer>Recebimentos confirmados pelo SPX ficam na fila até o envio explícito para Dados. Pendências antigas nunca são apagadas automaticamente.</footer>
</main>
<script>
const state={data:null,view:'today',requesting:false};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const dt=ms=>ms?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(Number(ms))):'-';
const occ=sec=>sec?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(new Date(Number(sec)*1000)):'-';

function requestData(){
  if(state.requesting)return;
  state.requesting=true;
  google.script.run
    .withSuccessHandler(data=>{state.requesting=false;state.data=data;render();})
    .withFailureHandler(err=>{state.requesting=false;$('warning').innerHTML='<div class="warning">Falha ao atualizar Dashboard: '+esc(err&&err.message||err)+'</div>';})
    .getDashboardData();
}

function render(){
  const data=state.data||{today:'',records:[]};
  const records=Array.isArray(data.records)?data.records:[];
  const today=records.filter(r=>r.received_day===data.today);
  const pendingToday=today.filter(r=>r.status!=='confirmed');
  const oldPending=records.filter(r=>r.received_day&&r.received_day!==data.today&&r.status!=='confirmed');
  const allPending=records.filter(r=>r.status!=='confirmed');

  $('mTotal').textContent=today.length;
  $('mPending').textContent=pendingToday.length;
  $('mOld').textContent=oldPending.length;
  $('mOperators').textContent=new Set(today.map(r=>r.operator_login).filter(Boolean)).size;
  $('sendPending').textContent='Enviar '+allPending.length+' para a planilha';
  $('sendPending').disabled=allPending.length===0;
  $('warning').innerHTML=oldPending.length?'<div class="warning">⚠ '+oldPending.length+' pendência(s) de dias anteriores. Elas também entram no envio em lote.</div>':'';

  const drivers=new Map();
  today.forEach(r=>{
    const id=String(r.driver_id||'').trim();
    const name=String(r.driver_name||'').trim();
    if(!id&&!name)return;

    const key=id||name.toLowerCase();
    const agency=String(r.agency||'').trim();
    const reason=String(r.reason||'Sem motivo informado').trim()||'Sem motivo informado';
    const item=drivers.get(key)||{
      id,
      name:name||'Motorista não identificado',
      agency,
      count:0,
      reasons:new Map()
    };

    item.count++;
    if(!item.agency&&agency)item.agency=agency;
    item.reasons.set(reason,(item.reasons.get(reason)||0)+1);
    drivers.set(key,item);
  });

  const top=[...drivers.values()]
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'))
    .slice(0,10);

  const reasonTotals=new Map();
  top.forEach(driver=>{
    driver.reasons.forEach((count,reason)=>{
      if(count>0)reasonTotals.set(reason,(reasonTotals.get(reason)||0)+count);
    });
  });

  const visibleReasons=[...reasonTotals.entries()]
    .filter(([,count])=>count>0)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'))
    .map(([reason])=>reason);

  if(!top.length){
    $('topDrivers').innerHTML='<div class="empty">Ainda não há motoristas para o ranking de hoje.</div>';
  }else{
    const headReasons=visibleReasons.map(reason=>
      '<th class="reason-head"><span>'+esc(reason)+'</span></th>'
    ).join('');

    const body=top.map((driver,index)=>{
      const reasonCells=visibleReasons.map(reason=>{
        const count=Number(driver.reasons.get(reason)||0);
        return '<td class="'+(count>0?'reason-count':'reason-zero')+'">'+(count>0?count:'')+'</td>';
      }).join('');

      return '<tr>'+
        '<td class="rank-col"><span class="rank-number">'+(index+1)+'</span></td>'+
        '<td class="driver-col"><span class="rank-driver-name">'+esc(driver.name)+'</span><span class="rank-driver-id">ID: '+esc(driver.id||'Não informado')+'</span></td>'+
        '<td class="agency-col">'+esc(driver.agency||'Não informado')+'</td>'+
        '<td class="total-col">'+driver.count+'</td>'+
        reasonCells+
      '</tr>';
    }).join('');

    $('topDrivers').innerHTML=
      '<table class="ranking-table"><thead><tr>'+
      '<th class="rank-col">Ranking</th>'+
      '<th class="driver-col">Driver</th>'+
      '<th class="agency-col">3PL</th>'+
      '<th class="total-col">Total</th>'+
      headReasons+
      '</tr></thead><tbody>'+body+'</tbody></table>';
  }

  let list=today;
  if(state.view==='pending')list=pendingToday;
  if(state.view==='old')list=oldPending;
  list=[...list].sort((a,b)=>Number(b.received_at||0)-Number(a.received_at||0));

  $('cardToday').classList.toggle('active',state.view==='today');
  $('cardPending').classList.toggle('active',state.view==='pending');
  $('cardOld').classList.toggle('active',state.view==='old');
  $('tableTitle').textContent=state.view==='pending'?'Pendentes de hoje':state.view==='old'?'Pendentes de dias anteriores':'Recebimentos de hoje';
  $('tableSubtitle').textContent=state.view==='pending'?'Recebimentos de hoje aguardando o envio explícito para Dados.':state.view==='old'?'Recebimentos de dias anteriores que continuam aguardando envio.':'Todos os recebimentos confirmados pelo SPX hoje.';

  const operators=[...new Set(list.map(r=>String(r.operator_login||'').trim().toLowerCase()).filter(Boolean))].sort();
  const previous=$('operator').value;
  $('operator').innerHTML='<option value="">Todos os operadores</option>'+operators.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  if(operators.includes(previous))$('operator').value=previous;

  const q=String($('search').value||'').trim().toLowerCase(),opFilter=String($('operator').value||'').toLowerCase();
  const filtered=list.filter(r=>{
    const text=[r.shipment_id,r.reason,r.driver_id,r.driver_name,r.agency,r.neighborhood,r.operator_login].join(' ').toLowerCase();
    return (!q||text.includes(q))&&(!opFilter||String(r.operator_login||'').toLowerCase()===opFilter);
  });

  $('rows').innerHTML=filtered.map(r=>'<tr><td>'+esc(dt(r.received_at))+'</td><td><strong>'+esc(r.shipment_id)+'</strong></td><td>'+esc(r.reason)+'</td><td>'+esc(r.driver_id)+'</td><td>'+esc(r.driver_name)+'</td><td>'+esc(r.agency)+'</td><td>'+esc(r.neighborhood)+'</td><td>'+esc(occ(r.occurrence_timestamp))+'</td><td>'+esc(r.operator_login||'Não identificado')+'</td></tr>').join('');
  $('empty').hidden=filtered.length>0;
  $('empty').textContent=state.view==='old'?'Nenhum pendente antigo.':state.view==='pending'?'Nenhum pendente de hoje.':'Nenhum recebimento hoje.';
}

const topDriversWrap=$('topDriversWrap');
const toggleTopDrivers=$('toggleTopDrivers');
let topDriversOpen=true;
toggleTopDrivers.onclick=()=>{
  topDriversOpen=!topDriversOpen;
  topDriversWrap.classList.toggle('ranking-collapsed',!topDriversOpen);
  toggleTopDrivers.textContent=topDriversOpen?'▾':'▸';
  toggleTopDrivers.title=topDriversOpen?'Fechar Top 10':'Abrir Top 10';
};

$('cardToday').onclick=()=>{state.view='today';render();};
$('cardPending').onclick=()=>{state.view='pending';render();};
$('cardOld').onclick=()=>{state.view='old';render();};
$('search').oninput=render;
$('operator').onchange=render;
$('refresh').onclick=requestData;
$('sendPending').onclick=()=>{
  const records=state.data&&Array.isArray(state.data.records)?state.data.records:[];
  const count=records.filter(r=>r.status!=='confirmed').length;
  if(!count){alert('Não há registros na fila para enviar.');return;}
  if(!confirm('Enviar '+count+' registro(s) da fila para a aba Dados?'))return;
  $('sendPending').disabled=true;
  $('sendPending').textContent='Enviando...';
  google.script.run
    .withSuccessHandler(result=>{
      const sent=Number(result&&result.sent||0);
      const duplicates=Number(result&&result.duplicates||0);
      const failed=Number(result&&result.failed||0);
      alert('Envio concluído.\nGravados: '+sent+'\nJá existentes: '+duplicates+'\nFalhas: '+failed);
      requestData();
    })
    .withFailureHandler(err=>{
      alert('Falha no envio: '+(err&&err.message||err));
      requestData();
    })
    .sendPendingDashboardToData();
};
$('clearConfirmed').onclick=()=>{
  const count=state.data&&state.data.records?state.data.records.filter(r=>r.received_day===state.data.today&&r.status==='confirmed').length:0;
  if(!count){alert('Não há registros já enviados para limpar hoje.');return;}
  if(!confirm('Limpar '+count+' registro(s) já enviado(s) de hoje?\\n\\nPendências não serão apagadas.'))return;
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
