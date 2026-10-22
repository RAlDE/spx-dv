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
 * - não faz deduplicação: cada recebimento enviado gera uma nova linha
 * - fórmulas nas células-alvo podem ser substituídas pelos dados recebidos
 */

const SPX_DV_CONFIG = Object.freeze({
  spreadsheetId: '14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY',
  sheetName: 'Dados',
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
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

    const row = findWritableRow_(sheet);
    writeRecord_(sheet, row, record);

    PropertiesService.getScriptProperties()
      .setProperty(SPX_DV_CONFIG.pointerProperty, String(row + 1));

    return jsonResponse_({
      ok: true,
      inserted: true,
      row
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

function numericIfSafe_(value) {
  const text = clean_(value);
  if (!/^\d+$/.test(text)) return text;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : text;
}

function findWritableRow_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const stored = Number(properties.getProperty(SPX_DV_CONFIG.pointerProperty) || 0);

  let row = Number.isInteger(stored) && stored >= 2
    ? stored
    : findRowAfterLastGreen_(sheet);

  if (row < 2) row = 2;

  // Procura em blocos para reduzir chamadas ao Sheets.
  const chunkSize = 50;

  while (true) {
    ensureRowExists_(sheet, row + chunkSize - 1);

    const backgrounds = sheet.getRange(row, 1, chunkSize, 1).getBackgrounds();
    const cValues = sheet.getRange(row, 3, chunkSize, 1).getDisplayValues();

    for (let index = 0; index < chunkSize; index += 1) {
      if (isGreenColor_(backgrounds[index][0])) continue;

      const displayValue = String(cValues[index][0] || '').trim();
      if (!displayValue) return row + index;
    }

    row += chunkSize;
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

  return lastGreen + 1;
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
