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
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
  batchStartProperty: 'SPX_DV_BATCH_START_V1',
  timezone: 'America/Sao_Paulo'
});

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'SPX-DV recebimento On Hold',
    sheet: SPX_DV_CONFIG.sheetName
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = parsePayload_(e);
    const record = normalizeRecord_(payload);

    if (!record.shipmentId) {
      return jsonResponse_({ ok: false, error: 'shipment_id obrigatório' });
    }
    if (!record.occurrenceTimestamp) {
      return jsonResponse_({ ok: false, error: 'occurrence_timestamp obrigatório' });
    }

    const spreadsheet = SpreadsheetApp.openById(SPX_DV_CONFIG.spreadsheetId);
    const sheet = spreadsheet.getSheetByName(SPX_DV_CONFIG.sheetName);
    if (!sheet) {
      return jsonResponse_({ ok: false, error: 'Aba Dados não encontrada' });
    }

    // Garante que qualquer gravação anterior já esteja visível antes de
    // escolher a próxima linha. Isso evita duas execuções sequenciais enxergarem
    // a mesma linha C como vazia.
    SpreadsheetApp.flush();

    const occurrenceKey = record.shipmentId + '|' + record.occurrenceTimestamp;
    const controlSheet = getControlSheet_(spreadsheet);

    if (occurrenceAlreadyRecorded_(controlSheet, occurrenceKey)) {
      return jsonResponse_({
        ok: true,
        duplicate: true,
        occurrence_key: occurrenceKey
      });
    }

    const row = findWritableRow_(sheet);
    writeRecord_(sheet, row, record);

    // Força a escrita na aba Dados antes de liberar o lock.
    // Sem isso, a próxima execução podia reutilizar a mesma linha e sobrescrever
    // o BR anterior.
    SpreadsheetApp.flush();

    const writtenShipment = clean_(sheet.getRange(row, 3).getDisplayValue()).toUpperCase();
    if (writtenShipment !== record.shipmentId) {
      throw new Error('Falha ao confirmar gravação do BR na linha ' + row);
    }

    rememberOccurrence_(controlSheet, occurrenceKey, row);
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
