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

const SPX_DV_BUILD = '1.3.68';

const SPX_DV_CONFIG = Object.freeze({
  spreadsheetId: '14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY',
  sheetName: 'Dados',
  controlSheetName: '_SPX_DV_CONTROLE',
  dashboardSheetName: '_SPX_DV_DASHBOARD',
  neighborhoodSheetName: '_SPX_DV_BAIRROS',
  dashboardCleanupProperty: 'SPX_DV_DASHBOARD_CLEAN_DAY_V1',
  dashboardRevisionProperty: 'SPX_DV_DASHBOARD_REVISION_V1',
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
  batchStartProperty: 'SPX_DV_BATCH_START_V1',
  timezone: 'America/Sao_Paulo'
});

function doGet(e) {
  const view = clean_(e && e.parameter && e.parameter.view).toLowerCase();
  if (view === 'dashboard') {
    const initialData = {
      ok: true,
      loading: true,
      today: Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd'),
      build: SPX_DV_BUILD,
      records: [],
      today_records: [],
      old_pending: []
    };

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

    const dataAgency = clean_(e && e.parameter && e.parameter.check_data_agency) === '1' &&
      record.status === 'confirmed'
      ? confirmedDashboardDataAgency_(spreadsheet, record)
      : null;
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
      status: record.status,
      agency: record.agency,
      neighborhood: record.neighborhood,
      ...(dataAgency ? {
        data_agency_verified: dataAgency.verified,
        data_agency: dataAgency.agency
      } : {})
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

// Pesquisa a chave imutável em _SPX_DV_CONTROLE, nunca apenas o BR.
function confirmedDashboardDataAgency_(spreadsheet, record) {
  const empty = { verified: false, agency: '', dataRow: 0 };
  if (!record?.occurrenceKey || !record?.shipmentId) return empty;
  const control = spreadsheet.getSheetByName(SPX_DV_CONFIG.controlSheetName);
  const dataSheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName);
  if (!control || !dataSheet || control.getLastRow() < 2) return empty;
  const match = control.getRange(2, 1, control.getLastRow() - 1, 1)
    .createTextFinder(record.occurrenceKey)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  if (!match) return empty;
  const dataRow = Number(control.getRange(match.getRow(), 2).getDisplayValue());
  if (!Number.isSafeInteger(dataRow) || dataRow < 2 || dataRow > dataSheet.getLastRow()) return empty;
  const values = dataSheet.getRange(dataRow, 3, 1, 5).getDisplayValues()[0];
  const writtenBr = clean_(values[0]).toUpperCase();
  const writtenDriver = clean_(values[2]);
  if (writtenBr !== clean_(record.shipmentId).toUpperCase() ||
      (record.driverId && writtenDriver && writtenDriver !== clean_(record.driverId))) {
    return empty;
  }
  return { verified: true, agency: clean_(values[4]), dataRow: dataRow };
}

function repairConfirmedDataAgency_(spreadsheet, record, payload) {
  if (record?.status !== 'confirmed' ||
      payload?.repair_confirmed_fields !== true ||
      payload?.agency_verified_by_at !== true ||
      !clean_(record?.agency)) {
    return { changed: false, reason: 'not_eligible' };
  }
  const found = confirmedDashboardDataAgency_(spreadsheet, record);
  if (!found.verified) return { changed: false, reason: 'control_or_driver_mismatch' };
  // Não sobrescrever uma 3PL preenchida. Corrigir só G vazio no BR/driver da ocorrência.
  if (found.agency) return { changed: false, reason: 'already_has_agency' };
  spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName)
    .getRange(found.dataRow, 7).setValue(clean_(record.agency));
  return { changed: true, reason: 'filled_blank_G' };
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

    if (payload.repair_confirmed_fields === true &&
        !findDashboardRow_(dashboardSheet, dashboardRecord.occurrenceKey)) {
      throw new Error('Reparo recusado: ocorrência não está no Dashboard');
    }
    const saved = upsertDashboardRecord_(dashboardSheet, dashboardRecord);
    const agencyRepair = repairConfirmedDataAgency_(spreadsheet, saved, payload);
    SpreadsheetApp.flush();

    result = {
      ok: true,
      dashboard: true,
      occurrence_key: dashboardRecord.occurrenceKey,
      status: saved.status,
      received_day: saved.receivedDay,
      received_at: saved.receivedAt,
      data_agency_repair: agencyRepair.reason
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
      if (payload.repair_confirmed_fields === true &&
          !findDashboardRow_(dashboardSheet, dashboardRecord.occurrenceKey)) {
        return jsonResponse_({ ok: false, error: 'Reparo recusado: ocorrência não está no Dashboard' });
      }
      const result = upsertDashboardRecord_(dashboardSheet, dashboardRecord);
      const agencyRepair = repairConfirmedDataAgency_(spreadsheet, result, payload);
      SpreadsheetApp.flush();
      return jsonResponse_({
        ok: true,
        dashboard: true,
        occurrence_key: dashboardRecord.occurrenceKey,
        status: result.status,
        data_agency_repair: agencyRepair.reason
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

function normalizeNeighborhoodName_(value) {
  let text = clean_(value).toLowerCase();
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {}
  return text.replace(/\s+/g, ' ').trim();
}

function isPlausibleNeighborhoodName_(value) {
  const text = clean_(value);
  const normalized = normalizeNeighborhoodName_(text);
  if (!normalized || normalized.length < 2) return false;
  if (/^\d+[a-z]?$/.test(normalized)) return false;
  // Evita aceitar bairro visivelmente truncado, como "Volta De C".
  // Google segue primeira fonte; se nenhum candidato confiável restar,
  // o módulo recorre ao Bairro Principal da AT.
  if (/\b(?:de|da|do|dos|das)\s+[a-z]$/i.test(normalized)) return false;

  if (/^(casa|apto|apartamento|bloco|lote|quadra|torre|unidade)\s*(n[ºo.]?\s*)?[\w.-]+$/i.test(normalized)) {
    return false;
  }

  return true;
}

function reverseGeocodeCandidatesAt_(latitude, longitude, distanceMeters, source) {
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
    neighborhood: 0,
    sublocality_level_1: 10,
    sublocality: 20,
    administrative_area_level_4: 40,
    administrative_area_level_3: 50
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
        if (!isPlausibleNeighborhoodName_(name)) return;

        const key = type + '|' + normalizeNeighborhoodName_(name);
        if (seen[key]) return;
        seen[key] = true;

        candidates.push({
          name: name,
          type: type,
          result_index: resultIndex,
          score: priorities[type] * 100 + resultIndex,
          distance_m: Number(distanceMeters || 0),
          source: source || 'exact'
        });
      });
    });
  });

  candidates.sort(function(a, b) {
    return Number(a.score || 0) - Number(b.score || 0);
  });

  return candidates;
}

function offsetCoordinate_(latitude, longitude, northMeters, eastMeters) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const metersPerDegreeLat = 111320;
  const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const metersPerDegreeLng = metersPerDegreeLat * cosLat;

  return {
    latitude: lat + Number(northMeters || 0) / metersPerDegreeLat,
    longitude: lng + Number(eastMeters || 0) / metersPerDegreeLng
  };
}

function bestStrongNeighborhoodCandidate_(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list.find(function(item) {
    return item.type === 'neighborhood';
  }) || list.find(function(item) {
    return item.type === 'sublocality_level_1';
  }) || list.find(function(item) {
    return item.type === 'sublocality';
  }) || null;
}

function nearbyNeighborhoodConsensus_(hits) {
  const groups = {};

  (hits || []).forEach(function(hit) {
    if (!hit || !hit.name) return;
    const key = normalizeNeighborhoodName_(hit.name);
    if (!key) return;

    if (!groups[key]) {
      groups[key] = {
        name: hit.name,
        count: 0,
        min_distance_m: Number(hit.distance_m || 0),
        types: {}
      };
    }

    groups[key].count += 1;
    groups[key].min_distance_m = Math.min(
      Number(groups[key].min_distance_m || 0),
      Number(hit.distance_m || 0)
    );
    groups[key].types[hit.type] = true;
  });

  const ranked = Object.keys(groups)
    .map(function(key) { return groups[key]; })
    .sort(function(a, b) {
      return Number(b.count || 0) - Number(a.count || 0) ||
        Number(a.min_distance_m || 0) - Number(b.min_distance_m || 0);
    });

  return ranked.length ? ranked[0] : null;
}

function reverseGeocodeNeighborhood_(latitude, longitude) {
  const lat = Math.round(Number(latitude) * 100000) / 100000;
  const lng = Math.round(Number(longitude) * 100000) / 100000;

  const exactCandidates = reverseGeocodeCandidatesAt_(lat, lng, 0, 'exact');
  const exactNeighborhood = exactCandidates.find(function(item) {
    return item.type === 'neighborhood';
  });

  if (exactNeighborhood) {
    return {
      ok: true,
      neighborhood: clean_(exactNeighborhood.name),
      confidence: 'high',
      source: 'exact_neighborhood',
      candidates: exactCandidates.slice(0, 12)
    };
  }

  const exactSublocality = exactCandidates.find(function(item) {
    return item.type === 'sublocality_level_1' || item.type === 'sublocality';
  }) || null;

  const probes = [
    { north: 120, east: 0, distance: 120 },
    { north: 0, east: 120, distance: 120 },
    { north: -120, east: 0, distance: 120 },
    { north: 0, east: -120, distance: 120 },
    { north: 300, east: 0, distance: 300 },
    { north: 0, east: 300, distance: 300 },
    { north: -300, east: 0, distance: 300 },
    { north: 0, east: -300, distance: 300 }
  ];

  const nearbyHits = [];
  const nearbyCandidates = [];
  let consensus = null;

  for (let index = 0; index < probes.length; index += 1) {
    const probe = probes[index];
    const point = offsetCoordinate_(lat, lng, probe.north, probe.east);
    const candidates = reverseGeocodeCandidatesAt_(
      point.latitude,
      point.longitude,
      probe.distance,
      'nearby'
    );

    candidates.slice(0, 6).forEach(function(item) {
      nearbyCandidates.push(item);
    });

    const best = bestStrongNeighborhoodCandidate_(candidates);
    if (best) nearbyHits.push(best);

    consensus = nearbyNeighborhoodConsensus_(nearbyHits);
    if (consensus && Number(consensus.count || 0) >= 2) break;
  }

  if (consensus && Number(consensus.count || 0) >= 2) {
    return {
      ok: true,
      neighborhood: clean_(consensus.name),
      confidence: 'medium',
      source: 'nearby_consensus',
      nearby_count: Number(consensus.count || 0),
      nearby_distance_m: Number(consensus.min_distance_m || 0),
      candidates: exactCandidates.concat(nearbyCandidates).slice(0, 20)
    };
  }

  if (exactSublocality) {
    return {
      ok: true,
      neighborhood: clean_(exactSublocality.name),
      confidence: 'low',
      source: 'exact_sublocality',
      candidates: exactCandidates.concat(nearbyCandidates).slice(0, 20)
    };
  }

  const nearestSingle = nearbyHits
    .slice()
    .sort(function(a, b) {
      return Number(a.distance_m || 0) - Number(b.distance_m || 0) ||
        Number(a.score || 0) - Number(b.score || 0);
    })[0];

  if (nearestSingle) {
    return {
      ok: true,
      neighborhood: clean_(nearestSingle.name),
      confidence: 'low',
      source: 'nearby_single',
      nearby_distance_m: Number(nearestSingle.distance_m || 0),
      candidates: exactCandidates.concat(nearbyCandidates).slice(0, 20)
    };
  }

  const broadFallback = exactCandidates.find(function(item) {
    return item.type === 'administrative_area_level_4' ||
      item.type === 'administrative_area_level_3';
  });

  if (broadFallback) {
    return {
      ok: true,
      neighborhood: clean_(broadFallback.name),
      confidence: 'low',
      source: 'administrative_fallback',
      candidates: exactCandidates.slice(0, 12)
    };
  }

  return {
    ok: true,
    neighborhood: '',
    confidence: 'none',
    source: 'no_match',
    candidates: exactCandidates.concat(nearbyCandidates).slice(0, 20)
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

function isValidDashboardNeighborhood_(value) {
  const name = clean_(value);
  return Boolean(name && normalizeNeighborhoodName_(name) !== 'atualizar base');
}

function upsertDashboardRecord_(sheet, incoming) {
  const row = findDashboardRow_(sheet, incoming.occurrenceKey);
  let current = null;

  if (row) {
    current = dashboardRecordFromRow_(
      sheet.getRange(row, 1, 1, 14).getValues()[0]
    );
  }

  // Cancelamentos explícitos de pendências antigas não podem ser reabertos por um upsert.
  const status = current && ['confirmed', 'cancelled'].includes(current.status)
    ? current.status
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
    // Nunca trocar um bairro verdadeiro pelo marcador antigo "Atualizar base".
    neighborhood: isValidDashboardNeighborhood_(incoming.neighborhood)
      ? incoming.neighborhood
      : (isValidDashboardNeighborhood_(current && current.neighborhood)
          ? current.neighborhood
          : (incoming.neighborhood || current && current.neighborhood || '')),
    occurrenceTimestamp: incoming.occurrenceTimestamp || current && current.occurrenceTimestamp || 0,
    flow: incoming.flow || current && current.flow || '',
    operatorLogin: current && current.operatorLogin || incoming.operatorLogin || '',
    status,
    updatedAt: Date.now()
  };

  const targetRow = row || Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, 14).setValues(dashboardRowValues_(merged));
  touchDashboardRevision_();
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
  // 1.3.67: preservar histórico. Não excluir ao virar o dia.
  void sheet;
  return 0;
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

function dashboardIsPending_(record) {
  const status = clean_(record && record.status).toLowerCase();
  return status !== 'confirmed' && status !== 'cancelled';
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
      dashboardIsPending_(record)
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

function dashboardRevisionValue_() {
  return Number(
    PropertiesService.getScriptProperties()
      .getProperty(SPX_DV_CONFIG.dashboardRevisionProperty) || 0
  );
}

function touchDashboardRevision_() {
  const revision = Date.now();
  PropertiesService.getScriptProperties()
    .setProperty(SPX_DV_CONFIG.dashboardRevisionProperty, String(revision));
  return revision;
}

function getDashboardRevision() {
  return {
    ok: true,
    build: SPX_DV_BUILD,
    revision: dashboardRevisionValue_()
  };
}

function dashboardLiveState_(data) {
  const source = data && typeof data === 'object' ? data : {};
  const records = Array.isArray(source.records) ? source.records : [];
  const todayRecords = Array.isArray(source.today_records) ? source.today_records : [];
  const oldPending = Array.isArray(source.old_pending) ? source.old_pending : [];
  const pendingToday = todayRecords.filter(dashboardIsPending_);
  const confirmedToday = todayRecords.filter(record =>
    clean_(record && record.status).toLowerCase() === 'confirmed'
  );
  const allPending = records.filter(dashboardIsPending_);

  const operatorCounts = {};
  todayRecords.forEach(record => {
    const login = clean_(record && record.operator_login).toLowerCase();
    if (!login) return;
    operatorCounts[login] = Number(operatorCounts[login] || 0) + 1;
  });

  const sortedToday = todayRecords.slice().sort((a, b) =>
    Number(b && b.received_at || 0) - Number(a && a.received_at || 0)
  );

  const rowsHtml = sortedToday.map(record =>
    '<tr>' +
      '<td>' + dashboardHtmlEscape_(dashboardFormatMillis_(record.received_at)) + '</td>' +
      '<td><strong>' + dashboardHtmlEscape_(record.shipment_id) + '</strong></td>' +
      '<td>' + dashboardHtmlEscape_(record.reason) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.driver_id) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.driver_name) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.agency) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.neighborhood) + '</td>' +
      '<td>' + dashboardHtmlEscape_(dashboardFormatSeconds_(record.occurrence_timestamp)) + '</td>' +
      '<td>' + dashboardHtmlEscape_(record.operator_login || 'Não identificado') + '</td>' +
    '</tr>'
  ).join('');

  const operatorOptionsHtml = Object.keys(operatorCounts)
    .sort()
    .map(login =>
      '<option value="' + dashboardHtmlEscape_(login) + '" data-count="' +
      operatorCounts[login] + '">' +
      dashboardHtmlEscape_(login) + ' (' + operatorCounts[login] + ')' +
      '</option>'
    ).join('');

  const warningHtml = source.ok === false && source.error
    ? '<div class="warning">Falha ao carregar dados do Dashboard: ' +
        dashboardHtmlEscape_(source.error) +
      '</div>'
    : (oldPending.length
        ? '<div class="warning">⚠ ' + oldPending.length +
          ' pendência(s) de dias anteriores.</div>'
        : '');

  return {
    ok: source.ok !== false,
    error: clean_(source.error),
    build: SPX_DV_BUILD,
    revision: dashboardRevisionValue_(),
    build_info:
      'servidor ' + SPX_DV_BUILD +
      ' · base ' + records.length +
      ' · hoje ' + todayRecords.length,
    rows_html: dashboardRowsHtml_(records),
    old_pending_rows_html: dashboardOldPendingHtml_(oldPending),
    day_options_html: dashboardDayOptionsHtml_(records, source.today),
    today: source.today,
    top_html: dashboardTopDriversHtml_(todayRecords),
    operator_options_html: operatorOptionsHtml,
    warning_html: warningHtml,
    today_count: todayRecords.length,
    pending_today_count: pendingToday.length,
    old_pending_count: oldPending.length,
    operators_count: Object.keys(operatorCounts).length,
    all_pending_count: allPending.length,
    confirmed_today_count: confirmedToday.length
  };
}

function getDashboardLiveState() {
  try {
    return dashboardLiveState_(getDashboardData());
  } catch (error) {
    return {
      ok: false,
      build: SPX_DV_BUILD,
      revision: dashboardRevisionValue_(),
      error: String(error && error.message ? error.message : error)
    };
  }
}

function sendPendingDashboardToData() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, busy: true, sent: 0, failed: 0, error: 'Outro envio ou alteração está em execução. Nenhuma nova operação foi iniciada. Aguarde a conclusão e atualize o Dashboard antes de tentar novamente.' };
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const dashboardSheet = getDashboardSheet_(spreadsheet);
    const dataSheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName);
    if (!dataSheet) throw new Error('Aba Dados não encontrada');

    // Nunca excluir histórico confirmado no envio em massa.
    const lastRow = dashboardSheet.getLastRow();
    if (lastRow < 2) {
      return { ok: true, pending: 0, sent: 0, duplicates: 0, failed: 0, mode: 'bulk' };
    }

    const rows = dashboardSheet.getRange(2, 1, lastRow - 1, 14).getValues();
    const pending = rows
      .map((values, index) => ({ index: index + 2, record: dashboardRecordFromRow_(values) }))
      .filter(item => dashboardIsPending_(item.record))
      .sort((a, b) => Number(a.record.receivedAt || 0) - Number(b.record.receivedAt || 0));

    if (!pending.length) {
      return { ok: true, pending: 0, sent: 0, duplicates: 0, failed: 0, mode: 'bulk' };
    }

    const controlSheet = getControlSheet_(spreadsheet);
    const recordedKeys = loadRecordedOccurrenceKeys_(controlSheet);
    const neighborhoodMap = loadNeighborhoodMap_(spreadsheet);

    const duplicateItems = [];
    const candidates = [];
    const neighborhoodUpdates = [];
    const errors = [];

    pending.forEach(item => {
      const dashboardRecord = item.record;
      try {
        if (!dashboardRecord.shipmentId || !dashboardRecord.occurrenceTimestamp) {
          throw new Error('Ficha incompleta');
        }

        if (!dashboardRecord.neighborhood &&
            clean_(dashboardRecord.flow).toLowerCase().indexOf('return') !== 0) {
          const cachedNeighborhood = clean_(neighborhoodMap.get(dashboardRecord.shipmentId) || '');
          if (cachedNeighborhood) {
            dashboardRecord.neighborhood = cachedNeighborhood;
            neighborhoodUpdates.push({ row: item.index, value: cachedNeighborhood });
          }
        }

        const occurrenceKey = dashboardRecord.occurrenceKey ||
          dashboardRecord.shipmentId + '|' + dashboardRecord.occurrenceTimestamp;

        if (recordedKeys.has(occurrenceKey)) {
          duplicateItems.push({ dashboardRow: item.index, occurrenceKey: occurrenceKey });
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

        candidates.push({
          dashboardRow: item.index,
          occurrenceKey: occurrenceKey,
          record: record
        });
      } catch (error) {
        errors.push({
          occurrence_key: dashboardRecord.occurrenceKey,
          shipment_id: dashboardRecord.shipmentId,
          error: String(error && error.message ? error.message : error)
        });
      }
    });

    if (neighborhoodUpdates.length) {
      setSingleColumnValuesByRows_(dashboardSheet, 9, neighborhoodUpdates);
    }

    const successful = [];
    if (candidates.length) {
      const writableRows = findWritableRows_(dataSheet, candidates.length);
      const assignments = candidates.map((item, index) => ({
        row: writableRows[index],
        dashboardRow: item.dashboardRow,
        occurrenceKey: item.occurrenceKey,
        record: item.record
      }));

      const groups = groupConsecutiveAssignments_(assignments);

      groups.forEach(group => {
        try {
          const startRow = group[0].row;
          const cToG = group.map(item => [
            item.record.shipmentId,
            item.record.reason,
            numericIfSafe_(item.record.driverId),
            item.record.driverName,
            item.record.agency
          ]);
          const iToJ = group.map(item => [
            item.record.neighborhood,
            item.record.occurrenceDate
          ]);

          dataSheet.getRange(startRow, 3, group.length, 5).setValues(cToG);
          dataSheet.getRange(startRow, 9, group.length, 2).setValues(iToJ);
          SpreadsheetApp.flush();

          const writtenShipments = dataSheet
            .getRange(startRow, 3, group.length, 1)
            .getDisplayValues();

          const confirmedGroup = [];
          group.forEach((item, index) => {
            const written = clean_(writtenShipments[index] && writtenShipments[index][0]).toUpperCase();
            if (written !== item.record.shipmentId) {
              errors.push({
                occurrence_key: item.occurrenceKey,
                shipment_id: item.record.shipmentId,
                error: 'Falha ao confirmar gravação na linha ' + item.row
              });
              return;
            }
            confirmedGroup.push(item);
          });

          if (confirmedGroup.length) {
            appendControlAssignments_(controlSheet, confirmedGroup);
            confirmedGroup.forEach(item => {
              recordedKeys.add(item.occurrenceKey);
              successful.push(item);
            });
          }
        } catch (error) {
          group.forEach(item => {
            errors.push({
              occurrence_key: item.occurrenceKey,
              shipment_id: item.record.shipmentId,
              error: String(error && error.message ? error.message : error)
            });
          });
        }
      });

      if (assignments.length) {
        const maxRow = Math.max.apply(null, assignments.map(item => Number(item.row || 0)));
        if (maxRow > 0) {
          PropertiesService.getScriptProperties()
            .setProperty(SPX_DV_CONFIG.pointerProperty, String(maxRow + 1));
        }
      }
    }

    const confirmedDashboardRows = duplicateItems
      .map(item => item.dashboardRow)
      .concat(successful.map(item => item.dashboardRow));

    if (confirmedDashboardRows.length) {
      markDashboardRowsConfirmedBulk_(dashboardSheet, confirmedDashboardRows);
    }

    SpreadsheetApp.flush();

    return {
      ok: errors.length === 0,
      mode: 'bulk',
      pending: pending.length,
      sent: successful.length,
      duplicates: duplicateItems.length,
      failed: errors.length,
      errors: errors.slice(0, 20)
    };
  } finally {
    lock.releaseLock();
  }
}

function clearConfirmedDashboard() {
  // 1.3.67: até links antigos recebem proteção contra exclusão física.
  return { ok: false, removed: 0, error: 'Histórico protegido: não há exclusão física de recebimentos enviados.' };
}

function changeOldPendingDashboardEntries(occurrenceKeys, action) {
  const requested = Array.isArray(occurrenceKeys) ? occurrenceKeys : [];
  if (requested.length > 100) return { ok: false, error: 'Máximo de 100 pendências antigas por operação.' };
  const keys = Array.from(new Set(requested.map(key => clean_(key)).filter(Boolean)));
  if (!keys.length) return { ok: false, error: 'Selecione pelo menos um BR antigo.' };
  if (action !== 'cancel') return { ok: false, error: 'Ação não autorizada.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, busy: true, error: 'Dashboard ocupado. Nenhuma pendência foi cancelada; tente após atualizar.' };
  }
  try {
    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const sheet = getDashboardSheet_(spreadsheet);
    const known = loadRecordedOccurrenceKeys_(getControlSheet_(spreadsheet));
    const today = Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd');
    const lastRow = sheet.getLastRow();
    const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 14).getValues() : [];
    const wanted = new Set(keys);
    let cancelled = 0;
    let alreadySent = 0;
    let skipped = 0;
    const cancelledRows = [];
    const sentRows = [];

    values.forEach(function(row, index) {
      const record = dashboardRecordFromRow_(row);
      if (!wanted.has(record.occurrenceKey)) return;
      wanted.delete(record.occurrenceKey);
      // Exclusivamente pendências anteriores: nunca hoje ou futuro.
      const day = dashboardEffectiveDay_(record);
      if (!day || day >= today || !dashboardIsPending_(record)) {
        skipped++;
        return;
      }
      if (known.has(record.occurrenceKey)) {
        sentRows.push(index + 2);
        alreadySent++;
      } else {
        cancelledRows.push(index + 2);
        cancelled++;
      }
    });
    skipped += wanted.size;
    // Grava em grupos contíguos, evitando centenas de setValues sob o mesmo lock.
    const now = Date.now();
    function writeStatusGroup(rowNumbers, status) {
      const unique = Array.from(new Set(rowNumbers)).sort((a,b)=>a-b);
      groupConsecutiveAssignments_(unique.map(row=>({row}))).forEach(group=>{
        sheet.getRange(group[0].row, 13, group.length, 2).setValues(
          group.map(()=>[status, now])
        );
      });
    }
    writeStatusGroup(sentRows, 'confirmed');
    writeStatusGroup(cancelledRows, 'cancelled');
    if (cancelled || alreadySent) {
      SpreadsheetApp.flush();
      touchDashboardRevision_();
    }
    return { ok: true, cancelled: cancelled, already_sent: alreadySent, skipped: skipped };
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

function dashboardDayOptionsHtml_(records, today) {
  const days = new Set([today]);
  (records || []).forEach(function(r) {
    const day = clean_(r && r.received_day);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  });
  return Array.from(days).sort().reverse().map(function(day) {
    return '<option value="' + dashboardHtmlEscape_(day) + '">' +
      (day === today ? 'Hoje · ' : '') + day.split('-').reverse().join('/') + '</option>';
  }).join('');
}
function dashboardRowsHtml_(records) {
  return (records || []).slice().sort(function(a,b) {
    return Number(b.received_at||0)-Number(a.received_at||0);
  }).map(function(r) {
    const status=clean_(r.status).toLowerCase();
    const label=status==='confirmed'?'Enviado':status==='cancelled'?'Cancelado da fila':'Pendente';
    const cells=[
      dashboardFormatMillis_(r.received_at), r.shipment_id, r.reason, r.driver_id,
      r.driver_name, r.agency, r.neighborhood, dashboardFormatSeconds_(r.occurrence_timestamp),
      r.operator_login, label
    ];
    return '<tr data-day="' + dashboardHtmlEscape_(r.received_day) + '" data-status="' +
      dashboardHtmlEscape_(status) + '">' + cells.map(function(value,index) {
        return '<td>' + (index===1?'<strong>':'')+dashboardHtmlEscape_(value)+(index===1?'</strong>':'')+'</td>';
      }).join('')+'</tr>';
  }).join('');
}
function dashboardOldPendingHtml_(records) {
  return (records||[]).map(function(r) {
    return '<tr><td><input type="checkbox" class="old-select" value="'+
      dashboardHtmlEscape_(r.occurrence_key)+'"></td>'+
      [r.shipment_id,dashboardFormatMillis_(r.received_at),r.reason,r.driver_name,r.agency,r.neighborhood]
        .map(function(v){return '<td>'+dashboardHtmlEscape_(v)+'</td>';}).join('')+'</tr>';
  }).join('');
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

    const topThreeClass = index < 3 ? ' top-three-rank rank-' + (index + 1) : '';
    return '<tr>' +
      '<td class="rank-col' + topThreeClass + '"><span class="rank-number">' + (index + 1) + '</span></td>' +
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
          dashboardIsPending_(record);
      });
  const pendingToday = todayRecords.filter(dashboardIsPending_);
  const confirmedToday = todayRecords.filter(function(record) {
    return clean_(record && record.status).toLowerCase() === 'confirmed';
  });
  const allPending = records.filter(dashboardIsPending_);

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
  const serverHistoryRowsHtml = dashboardRowsHtml_(records);
  const serverOldPendingRowsHtml = dashboardOldPendingHtml_(oldPending);
  const serverDayOptionsHtml = dashboardDayOptionsHtml_(records, clean_(data.today) || Utilities.formatDate(new Date(), SPX_DV_CONFIG.timezone, 'yyyy-MM-dd'));
  const serverBuildInfo = data.loading
    ? 'servidor ' + SPX_DV_BUILD + ' · carregando dados atuais...'
    : 'servidor ' + SPX_DV_BUILD +
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
.ranking-wrap{overflow:auto;border:1px solid #2b211b;border-radius:10px;background:#050505}.ranking-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;background:#050505}.ranking-table th,.ranking-table td{border-right:1px solid #262626;border-bottom:1px solid #262626;padding:9px 11px;text-align:center;white-space:nowrap}.ranking-table th:first-child,.ranking-table td:first-child{border-left:1px solid #262626}.ranking-table thead th{position:sticky;top:0;z-index:2;background:#11100f;color:#fff;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.38px;vertical-align:middle;border-top:1px solid #6b3415;border-bottom-color:#4a260f}.ranking-table thead th:first-child{border-top-left-radius:8px}.ranking-table thead th:last-child{border-top-right-radius:8px}.ranking-table .rank-col{width:68px;min-width:68px}.ranking-table .driver-col{min-width:260px;text-align:left}.ranking-table .agency-col{min-width:145px;text-align:left}.ranking-table .total-col{min-width:76px;font-size:14px;font-weight:900;color:#fff;background:#0d0d0d}.ranking-table thead .total-col{background:#16110e;color:#fff}.ranking-table .reason-head{position:relative;width:58px;min-width:58px;max-width:58px;height:205px;padding:0;vertical-align:bottom;overflow:visible}.ranking-table .reason-head>span{position:absolute;left:20px;bottom:12px;display:block;width:190px;transform-origin:left bottom;transform:rotate(-55deg);white-space:nowrap;margin:0;color:#fff;font-size:11px;font-weight:800;text-align:left;text-transform:none;letter-spacing:.1px}.ranking-table tbody tr:hover td{background:#100b08}.ranking-table .reason-count{font-weight:900;color:#fff;font-size:14px}.ranking-table .reason-zero{color:#52525b}.ranking-table td.top-three-rank{background:rgba(127,29,29,.20);border-color:rgba(248,113,113,.20)}.ranking-table td.top-three-rank .rank-number{background:rgba(127,29,29,.38);border:1px solid rgba(248,113,113,.28);color:#fff;box-shadow:0 0 10px rgba(127,29,29,.18)}.rank-number{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#21140d;color:#fff;font-weight:900}.rank-driver-name{font-weight:800;color:#fff}.rank-driver-id{display:block;color:#9ca3af;font-size:10px;margin-top:2px}.top-summary{cursor:pointer;list-style:none}.top-summary::-webkit-details-marker{display:none}.top-summary::after{content:'▸';display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid #6b3415;background:#0b0705;color:#fdba74;font-size:18px;font-weight:900;box-shadow:0 0 12px rgba(249,115,22,.1)}details[open]>.top-summary::after{content:'▾'}
.ranking-table{width:max-content;min-width:0}.ranking-table th,.ranking-table td{padding:7px 6px}.ranking-table .rank-col{width:62px;min-width:62px;max-width:62px}.ranking-table .driver-col{width:230px;min-width:230px;max-width:230px;white-space:normal}.ranking-table .agency-col{width:126px;min-width:126px;max-width:126px;white-space:normal}.ranking-table .total-col{width:62px;min-width:62px;max-width:62px}.ranking-table .reason-head{position:relative;width:54px;min-width:54px;max-width:54px;height:238px;padding:5px 0 8px;overflow:hidden;vertical-align:bottom}.ranking-table .reason-head>span{position:static;display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);transform-origin:center;max-height:226px;width:auto;white-space:nowrap;overflow:visible;margin:0;font-size:11px;line-height:1.1;text-align:left}.ranking-table tbody .reason-count,.ranking-table tbody .reason-zero{width:54px;min-width:54px;max-width:54px;border-right:1px solid #37302b}.ranking-table .rank-driver-name{white-space:normal;overflow-wrap:break-word}.ranking-table tbody .driver-col{white-space:normal}.column-filter-open{width:100%;min-width:90px;max-width:190px;padding:7px 8px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid #3f3f46;background:#020202;color:#fff;font-size:11px;font-weight:500;border-radius:7px}.column-filter-open.active{border-color:#fb923c;color:#fdba74}.filter-popup{position:fixed;z-index:2147483000;width:320px;max-width:calc(100vw - 16px);padding:10px;border-radius:10px;border:1px solid #7c4a16;background:#100b08;box-shadow:0 18px 45px rgba(0,0,0,.88)}.filter-popup[hidden]{display:none}.filter-popup input{width:100%;padding:9px 10px;border:1px solid #52525b;background:#030303;color:#fff;border-radius:7px;outline-color:#fb923c}.filter-choices{margin-top:8px;max-height:260px;overflow:auto}.filter-choice{display:block;width:100%;text-align:left;padding:7px 9px;background:transparent;border:0;box-shadow:none;font-weight:500;white-space:normal;overflow-wrap:anywhere}.filter-choice[aria-selected="true"]{background:#43200d;color:#fdba74}.filter-choice:hover{background:#281207}.filter-choice-empty{color:#9ca3af;padding:9px}.table-wrap{max-height:64vh;overflow:auto;border:1px solid #262626;border-radius:10px}table{border-collapse:collapse;width:100%;min-width:1450px;background:#050505}th,td{padding:11px 12px;border-bottom:1px solid #262626;text-align:left;vertical-align:top}thead tr:first-child th{position:sticky;top:0;z-index:3;background:#0d0805;color:#fdba74;font-size:11px;text-transform:uppercase;letter-spacing:.35px;box-shadow:inset 0 -1px #7c2d12,0 4px 14px rgba(249,115,22,.08)}.column-filters th{position:sticky;top:39px;z-index:2;background:#080503;padding:7px}.column-filter{width:100%;min-width:90px;padding:7px 8px;background:#020202;border:1px solid #3f3f46;color:#fff;border-radius:7px;font-size:11px}.column-filter::placeholder{color:#6b7280}tbody tr:hover{background:#100b08}
.old-details{margin:0 0 16px;border:1px solid #7c4a16;border-radius:10px;padding:12px;background:#100904}.old-details summary{cursor:pointer;color:#fde68a;font-weight:800}.old-panel-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.old-panel-actions button{padding:8px 11px}.old-panel-note{font-size:12px;color:#d1d5db}.old-table-wrap{max-height:350px;overflow:auto}.old-table{min-width:900px}.old-table th,.old-table td{padding:8px 10px}.history-filter{padding:9px 11px;background:#030303;color:#fff;border:1px solid #6b3415;border-radius:9px;min-width:180px}.column-filter{cursor:pointer}.warning{margin:0 0 16px;padding:11px 14px;border:1px solid #f59e0b55;border-radius:10px;background:#78350f25;color:#fde68a}.empty{padding:30px;text-align:center;color:#94a3b8}.action-status{min-height:18px;margin-top:9px;color:#fdba74;font-size:11px}footer{color:#94a3b8;font-size:11px}
@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}main{padding:14px}.operator-filter{min-width:220px}}@media(max-width:520px){.metrics{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<header><div><h1>Dashboard de Recebimento</h1><div class="muted">SPX-DV · somente recebimentos confirmados pelo SPX entram na fila · <span id="buildInfo">${dashboardHtmlEscape_(serverBuildInfo)}</span></div></div><div><div class="actions"><button id="sendPending" class="primary" data-count="${allPending.length}"${allPending.length ? '' : ' disabled'}>Enviar ${allPending.length} em massa</button><button id="clearConfirmed" class="danger" data-count="${confirmedToday.length}"${confirmedToday.length ? '' : ' disabled'}>Ocultar enviados</button><button id="refresh" type="button">Atualizar</button></div><div id="actionStatus" class="action-status"></div></div></header>
<div id="warning">${serverWarningHtml}</div>
<details id="oldPendingDetails" class="old-details">
<summary>Pendências de dias anteriores: <strong id="oldPendingLabel">${oldPending.length}</strong> — clicar para ver os BRs e selecionar cancelamentos</summary>
<div class="old-panel-actions"><button type="button" id="selectOldAll">Selecionar todos os antigos</button><button type="button" id="cancelOldSelected" class="danger">Cancelar selecionados da fila</button><span class="old-panel-note">Somente pendências antigas. Não cancela pedidos no SPX, não apaga Dados e não altera recebimentos de hoje.</span></div>
<div class="old-table-wrap"><table class="old-table"><thead><tr><th>Selecionar</th><th>Pedido</th><th>Recebido em</th><th>Motivo</th><th>Motorista</th><th>3PL</th><th>Bairro</th></tr></thead><tbody id="oldPendingRows">${serverOldPendingRowsHtml}</tbody></table></div>
</details>
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
<div class="panel-head"><div><h2>Recebimentos por data</h2><div class="muted">Histórico preservado e filtros locais, sem navegação externa.</div></div><div class="filters"><select id="dayFilter" class="history-filter">${serverDayOptionsHtml}</select><select id="operator" class="operator-filter"><option value="" data-count="${todayRecords.length}">Todos os operadores (${todayRecords.length})</option>${serverOperatorOptions}</select><span id="operatorCount" class="filter-badge">${todayRecords.length} recebidos</span><input id="generalSearch" class="search" placeholder="Filtro geral: pedido, login, motorista, 3PL, bairro, motivo..."><button id="clearFilters" type="button">Limpar filtros</button><span id="filterInfo" class="filter-info">Mostrando ${todayRecords.length} de ${todayRecords.length}</span></div></div>
<div class="table-wrap"><table id="receiveTable"><thead><tr><th>Recebido em</th><th>Pedido</th><th>Motivo do APP</th><th>Driver ID</th><th>Motorista</th><th>Transportadora 3PL</th><th>Bairro</th><th>Data da ocorrência</th><th>Login SPX</th><th>Status</th></tr><tr class="column-filters">${Array.from({length:10},function(_,i){return '<th><button type="button" class="column-filter-open" data-col="'+i+'" aria-haspopup="listbox">Todos ▾</button><select class="column-filter" data-col="'+i+'" hidden aria-label="Valor selecionado da coluna '+(i+1)+'"><option value="">Todos</option></select></th>';}).join('')}</tr></thead><tbody id="rows">${serverHistoryRowsHtml}</tbody></table><div id="empty" class="empty"${records.length ? ' hidden' : ''}>Nenhum recebimento corresponde aos filtros.</div></div>
</section>
<footer>Recebimentos confirmados pelo SPX ficam na fila até o envio explícito para Dados. Pendências antigas nunca são apagadas automaticamente.</footer>
</main>
<div id="filterPopup" class="filter-popup" hidden role="dialog" aria-label="Pesquisar valores da coluna"><input type="search" id="filterSearch" placeholder="Pesquisar nesta coluna..." autocomplete="off" aria-label="Pesquisar valores"><div id="filterChoices" class="filter-choices" role="listbox"></div></div>
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
    if(!select || select.selectedIndex<0)return 0;
    return Number(select.options[select.selectedIndex].getAttribute('data-count')||0);
  }
  function rebuildOperatorOptions(){
    var select=byId('operator');if(!select)return;
    var selected=select.value,day=byId('dayFilter')&&byId('dayFilter').value,counts={},total=0;
    rows().forEach(function(row){
      if(day&&row.getAttribute('data-day')!==day)return;
      total++;
      var login=String(row.cells[8]&&row.cells[8].textContent||'').trim().toLowerCase();
      if(login)counts[login]=(counts[login]||0)+1;
    });
    select.innerHTML='';
    var all=document.createElement('option');
    all.value='';all.textContent='Todos os operadores ('+total+')';
    all.setAttribute('data-count',String(total));select.appendChild(all);
    Object.keys(counts).sort().forEach(function(login){
      var o=document.createElement('option');
      o.value=login;o.textContent=login+' ('+counts[login]+')';
      o.setAttribute('data-count',String(counts[login]));select.appendChild(o);
    });
    if(Array.prototype.some.call(select.options,function(o){return o.value===selected;}))select.value=selected;
  }
  function rebuildColumnOptions(){
    var day=byId('dayFilter')&&byId('dayFilter').value;
    var eligible=rows().filter(function(r){return !day||r.getAttribute('data-day')===day;});
    Array.prototype.forEach.call(document.querySelectorAll('.column-filter'),function(select){
      var selected=select.value,col=Number(select.getAttribute('data-col')),values=new Map();
      eligible.forEach(function(row){
        var raw=String(row.cells[col]&&row.cells[col].textContent||'').trim(),key=normalize(raw);
        if(!values.has(key))values.set(key,{label:raw,count:0});
        values.get(key).count++;
      });
      select.innerHTML='';
      var all=document.createElement('option');all.value='';all.textContent='Todos';select.appendChild(all);
      Array.from(values.entries()).sort(function(a,b){
        if(!a[0])return -1;if(!b[0])return 1;
        return a[1].label.localeCompare(b[1].label,'pt-BR');
      }).forEach(function(pair){
        var option=document.createElement('option');
        option.value=pair[0]||'__spxdv_vazio__';
        option.textContent=(pair[0]?pair[1].label:'(Vazio)')+' ('+pair[1].count+')';
        select.appendChild(option);
      });
      if(Array.prototype.some.call(select.options,function(o){return o.value===selected;}))select.value=selected;
    });
  }
  function applyFilters(){
    try{
      var day=byId('dayFilter')&&byId('dayFilter').value;
      var operator=normalize(byId('operator')&&byId('operator').value);
      var general=normalize(byId('generalSearch')&&byId('generalSearch').value);
      var colFilters={};
      Array.prototype.forEach.call(document.querySelectorAll('.column-filter'),function(input){
        colFilters[Number(input.getAttribute('data-col'))]=input.value;
      });
      var allRows=rows(),visible=0,totalDay=0;
      allRows.forEach(function(row){
        var cells=Array.prototype.map.call(row.cells||[],function(cell){return normalize(cell.textContent);});
        var sameDay=!day||row.getAttribute('data-day')===day;
        if(sameDay)totalDay++;
        var login=cells[8]||'';
        var ok=sameDay&&(!hideConfirmed||row.getAttribute('data-status')!=='confirmed')&&(!operator||login===operator)&&(!general||cells.join(' ').indexOf(general)>=0);
        if(ok)Object.keys(colFilters).some(function(key){
          var filter=colFilters[key],cell=cells[Number(key)]||'';
          if(filter&&(filter==='__spxdv_vazio__'?cell!=='':cell!==filter)){
            ok=false;return true;
          }
          return false;
        });
        row.hidden=!ok;if(ok)visible++;
      });
      if(byId('filterInfo'))byId('filterInfo').textContent='Mostrando '+visible+' de '+totalDay+' da data escolhida';
      if(byId('operatorCount')){
        var count=operator?selectedOperatorCount():totalDay;
        byId('operatorCount').textContent=count+' recebido'+(count===1?'':'s');
      }
      if(byId('empty'))byId('empty').hidden=visible>0;
    }catch(error){setStatus('Filtro indisponível: '+String(error&&error.message||error));}
  }
  function clearFilters(){
    var day=byId('dayFilter');
    if(day && day.options.length) day.selectedIndex=0;
    rebuildOperatorOptions();
    rebuildColumnOptions();
    if(byId('operator'))byId('operator').value='';
    if(byId('generalSearch'))byId('generalSearch').value='';
    Array.prototype.forEach.call(document.querySelectorAll('.column-filter'),function(x){x.value='';});
    applyFilters();
  }

  function setStatus(message){
    var el=byId('actionStatus');
    if(el) el.textContent=String(message || '');
  }

  var hideConfirmed=false;
  var liveRevision=0;
  var liveLoading=false;
  var revisionLoading=false;

  function applyLiveState(state){
    if(!state || state.ok===false){
      setStatus('Falha ao atualizar: '+String(state && state.error || 'resposta inválida'));
      return;
    }

    liveRevision=Number(state.revision || liveRevision || 0);

    var buildInfo=byId('buildInfo');
    if(buildInfo) buildInfo.textContent=String(state.build_info || 'servidor '+String(state.build || ''));

    var rowsBody=byId('rows');
    if(rowsBody) rowsBody.innerHTML=String(state.rows_html || '');
    var daySelect=byId('dayFilter');
    if(daySelect){
      var oldDay=daySelect.value || String(state.today||'');
      daySelect.innerHTML=String(state.day_options_html||'');
      if(Array.prototype.some.call(daySelect.options,function(o){return o.value===oldDay;})) daySelect.value=oldDay;
      else if(state.today) daySelect.value=String(state.today);
    }
    var oldRows=byId('oldPendingRows');
    if(oldRows)oldRows.innerHTML=String(state.old_pending_rows_html||'');
    if(byId('oldPendingLabel'))byId('oldPendingLabel').textContent=String(Number(state.old_pending_count||0));
    rebuildOperatorOptions();
    rebuildColumnOptions();

    var top=byId('topDrivers');
    if(top) top.innerHTML=String(state.top_html || '');

    var warning=byId('warning');
    if(warning) warning.innerHTML=String(state.warning_html || '');

    var total=Number(state.today_count || 0);
    var pending=Number(state.pending_today_count || 0);
    var oldPending=Number(state.old_pending_count || 0);
    var operators=Number(state.operators_count || 0);
    var allPending=Number(state.all_pending_count || 0);
    var confirmed=Number(state.confirmed_today_count || 0);

    if(byId('mTotal')) byId('mTotal').textContent=String(total);
    if(byId('mPending')) byId('mPending').textContent=String(pending);
    if(byId('mOld')) byId('mOld').textContent=String(oldPending);
    if(byId('mOperators')) byId('mOperators').textContent=String(operators);


    var send=byId('sendPending');
    if(send){
      send.setAttribute('data-count',String(allPending));
      send.textContent='Enviar '+allPending+' em massa';
      send.disabled=allPending===0;
    }

    var clear=byId('clearConfirmed');
    if(clear){
      clear.setAttribute('data-count',String(confirmed));
      clear.disabled=false;
    }

    applyFilters();
  }

  function refreshDashboardLive(showStatus){
    if(liveLoading) return;
    if(!(window.google && google.script && google.script.run)){
      setStatus('Atualização automática indisponível nesta página.');
      return;
    }

    liveLoading=true;
    if(showStatus) setStatus('Atualizando dados atuais...');

    google.script.run
      .withSuccessHandler(function(state){
        liveLoading=false;
        applyLiveState(state);
        if(showStatus && state && state.ok!==false) setStatus('Atualizado.');
      })
      .withFailureHandler(function(error){
        liveLoading=false;
        setStatus('Falha ao atualizar: '+String(error && error.message || error));
      })
      .getDashboardLiveState();
  }

  function pollDashboardRevision(){
    if(document.hidden || revisionLoading || liveLoading) return;
    if(!(window.google && google.script && google.script.run)) return;

    revisionLoading=true;
    google.script.run
      .withSuccessHandler(function(result){
        revisionLoading=false;
        var revision=Number(result && result.revision || 0);
        if(!liveRevision || (revision && revision!==liveRevision)){
          refreshDashboardLive(false);
        }
      })
      .withFailureHandler(function(){
        revisionLoading=false;
      })
      .getDashboardRevision();
  }

  function bindActionButtons(){
    var refresh=byId('refresh');
    if(refresh){
      refresh.addEventListener('click',function(){
        refreshDashboardLive(true);
      });
    }

    var send=byId('sendPending');
    if(send){
      send.addEventListener('click',function(){
        var count=Number(send.getAttribute('data-count') || 0);
        if(!count){ alert('Não há registros na fila para enviar.'); return; }
        if(!confirm('Enviar '+count+' registro(s) em massa para a aba Dados?')) return;
        if(!(window.google && google.script && google.script.run)){
          setStatus('Ação indisponível nesta página.');
          return;
        }
        send.disabled=true;
        setStatus('Preparando envio em massa para Dados...');
        google.script.run
          .withSuccessHandler(function(result){
            if(!result || result.ok===false){
              send.disabled=false;
              setStatus('Envio não iniciado: '+String(result&&result.error||'sem resposta'));
              refreshDashboardLive(false);
              return;
            }
            var sent=Number(result && result.sent || 0);
            var duplicates=Number(result && result.duplicates || 0);
            var failed=Number(result && result.failed || 0);
            setStatus('Concluído: '+sent+' gravados, '+duplicates+' já existentes, '+failed+' falhas. Atualizando Dash...');
            alert('Envio concluído.\\nGravados: '+sent+'\\nJá existentes: '+duplicates+'\\nFalhas: '+failed);
            refreshDashboardLive(false);
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
        hideConfirmed=!hideConfirmed;
        clear.textContent=hideConfirmed?'Mostrar enviados':'Ocultar enviados';
        applyFilters();
      });
    }

    var selectOld=byId('selectOldAll');
    if(selectOld)selectOld.addEventListener('click',function(){
      var all=Array.prototype.slice.call(document.querySelectorAll('.old-select'));
      var count=Math.min(all.length,100);
      all.forEach(function(input,index){input.checked=index<count;});
      if(all.length>100)setStatus('Selecionados 100 de '+all.length+' antigos. Cancele em grupos de até 100.');
      else setStatus('Selecionados '+count+' BRs antigos.');
    });

    var cancelOld=byId('cancelOldSelected');
    if(cancelOld)cancelOld.addEventListener('click',function(){
      var selected=Array.prototype.slice.call(document.querySelectorAll('.old-select:checked'))
        .map(function(input){return input.value;});
      if(!selected.length){alert('Selecione os BRs antigos que deseja cancelar da fila.');return;}
      if(selected.length>100){alert('Selecione no máximo 100 BRs antigos por vez.');return;}
      if(!confirm('Cancelar '+selected.length+' pendência(s) de DIAS ANTERIORES da fila do Dashboard?\\n\\nIsso NÃO cancela pedidos no SPX, NÃO apaga Dados e NÃO afeta recebimentos de hoje.'))return;
      if(!(window.google&&google.script&&google.script.run)){
        setStatus('Ação indisponível nesta página.');return;
      }
      cancelOld.disabled=true;
      setStatus('Conferindo datas e cancelando apenas pendências antigas selecionadas...');
      google.script.run
        .withSuccessHandler(function(result){
          cancelOld.disabled=false;
          if(!result||result.ok===false){
            setStatus('Cancelamento não concluído: '+String(result&&result.error||'sem resposta'));return;
          }
          setStatus('Retirados da fila: '+Number(result.cancelled||0)+
            ' · já enviados: '+Number(result.already_sent||0)+
            ' · protegidos/não encontrados: '+Number(result.skipped||0));
          refreshDashboardLive(false);
        })
        .withFailureHandler(function(error){
          cancelOld.disabled=false;
          setStatus('Falha ao cancelar antigos: '+String(error&&error.message||error));
        })
        .changeOldPendingDashboardEntries(selected,'cancel');
    });
  }
  try{
    var operator=byId('operator');
    var general=byId('generalSearch');
    var clearFiltersButton=byId('clearFilters');
    if(operator) operator.addEventListener('change',applyFilters);
    if(general) general.addEventListener('input',applyFilters);
    Array.prototype.slice.call(document.querySelectorAll('.column-filter')).forEach(function(input){
      input.addEventListener('change',applyFilters);
    });
    if(clearFiltersButton) clearFiltersButton.addEventListener('click',clearFilters);
    var dayFilter=byId('dayFilter');
    if(dayFilter)dayFilter.addEventListener('change',function(){
      rebuildOperatorOptions();rebuildColumnOptions();applyFilters();
    });
    rebuildOperatorOptions();rebuildColumnOptions();
    bindActionButtons();
    applyFilters();
    setStatus('Carregando dados atuais...');
    refreshDashboardLive(false);
    window.setInterval(pollDashboardRevision,2500);
    document.addEventListener('visibilitychange',function(){
      if(!document.hidden) pollDashboardRevision();
    });
  }catch(error){
    setStatus('Falha ao iniciar controles: '+String(error && error.message || error));
  }
})();
</script>
</body>
</html>`;
}

function loadRecordedOccurrenceKeys_(controlSheet) {
  const lastRow = controlSheet.getLastRow();
  if (lastRow < 2) return new Set();

  return new Set(
    controlSheet.getRange(2, 1, lastRow - 1, 1)
      .getDisplayValues()
      .map(row => clean_(row[0]))
      .filter(Boolean)
  );
}

function loadNeighborhoodMap_(spreadsheet) {
  const sheet = getNeighborhoodSheet_(spreadsheet);
  const lastRow = sheet.getLastRow();
  const result = new Map();
  if (lastRow < 2) return result;

  sheet.getRange(2, 1, lastRow - 1, 2)
    .getDisplayValues()
    .forEach(row => {
      const shipment = clean_(row[0]).toUpperCase();
      const neighborhood = clean_(row[1]);
      if (shipment && neighborhood) result.set(shipment, neighborhood);
    });

  return result;
}

function findWritableRows_(sheet, needed) {
  const amount = Math.max(0, Number(needed || 0));
  if (!amount) return [];

  let effectiveBatchStart = findRowAfterLastGreen_(sheet);
  let cursor = Math.max(2, effectiveBatchStart);
  const selected = [];

  while (selected.length < amount) {
    const remaining = amount - selected.length;
    const chunkSize = Math.max(500, Math.min(5000, remaining * 3 + 200));
    const endRow = cursor + chunkSize - 1;
    ensureRowExists_(sheet, endRow);

    const backgrounds = sheet.getRange(cursor, 1, chunkSize, 1).getBackgrounds();
    const cValues = sheet.getRange(cursor, 3, chunkSize, 1).getDisplayValues();

    for (let index = 0; index < chunkSize; index += 1) {
      const row = cursor + index;

      if (isGreenColor_(backgrounds[index][0])) {
        effectiveBatchStart = row + 1;
        selected.length = 0;
        continue;
      }

      if (row < effectiveBatchStart) continue;
      if (String(cValues[index][0] || '').trim()) continue;
      selected.push(row);
    }

    cursor = endRow + 1;
  }

  PropertiesService.getScriptProperties()
    .setProperty(SPX_DV_CONFIG.batchStartProperty, String(effectiveBatchStart));

  return selected.slice(0, amount);
}

function groupConsecutiveAssignments_(assignments) {
  const sorted = (Array.isArray(assignments) ? assignments.slice() : [])
    .filter(item => Number(item && item.row || 0) > 0)
    .sort((a, b) => Number(a.row || 0) - Number(b.row || 0));

  const groups = [];
  sorted.forEach(item => {
    const current = groups[groups.length - 1];
    if (!current || Number(item.row) !== Number(current[current.length - 1].row) + 1) {
      groups.push([item]);
    } else {
      current.push(item);
    }
  });
  return groups;
}

function appendControlAssignments_(controlSheet, assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return;

  const startRow = Math.max(controlSheet.getLastRow() + 1, 2);
  const registeredAt = new Date();
  controlSheet.getRange(startRow, 1, assignments.length, 3).setValues(
    assignments.map(item => [
      item.occurrenceKey,
      item.row,
      registeredAt
    ])
  );
}

function markDashboardRowsConfirmedBulk_(dashboardSheet, rowNumbers) {
  const unique = Array.from(new Set(
    (Array.isArray(rowNumbers) ? rowNumbers : [])
      .map(value => Number(value || 0))
      .filter(value => value >= 2)
  )).sort((a, b) => a - b);

  if (!unique.length) return;

  const assignments = unique.map(row => ({ row: row }));
  const groups = groupConsecutiveAssignments_(assignments);
  const now = Date.now();

  groups.forEach(group => {
    dashboardSheet.getRange(group[0].row, 13, group.length, 2).setValues(
      group.map(() => ['confirmed', now])
    );
  });
  touchDashboardRevision_();
}

function setSingleColumnValuesByRows_(sheet, column, assignments) {
  const cleanAssignments = (Array.isArray(assignments) ? assignments.slice() : [])
    .filter(item => Number(item && item.row || 0) >= 1)
    .sort((a, b) => Number(a.row || 0) - Number(b.row || 0));

  if (!cleanAssignments.length) return;

  const groups = [];
  cleanAssignments.forEach(item => {
    const current = groups[groups.length - 1];
    if (!current || Number(item.row) !== Number(current[current.length - 1].row) + 1) {
      groups.push([item]);
    } else {
      current.push(item);
    }
  });

  groups.forEach(group => {
    sheet.getRange(group[0].row, column, group.length, 1).setValues(
      group.map(item => [item.value])
    );
  });
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
