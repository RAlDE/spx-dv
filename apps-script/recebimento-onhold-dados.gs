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
 * - uma ocorrência exata (BR + timestamp) não é duplicada
 * - fórmulas nas células-alvo podem ser substituídas quando houver dado real
 */

const SPX_DV_CONFIG = Object.freeze({
  spreadsheetId: '14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY',
  sheetName: 'Dados',
  pointerProperty: 'SPX_DV_NEXT_ROW_V1',
  notePrefix: 'SPX-DV:',
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

    const occurrenceKey = record.shipmentId + '|' + record.occurrenceTimestamp;
    const existingRow = findExistingOccurrenceRow_(sheet, record.shipmentId, occurrenceKey);

    if (existingRow) {
      // Reenvio da mesma ocorrência: não cria nova linha.
      // Se uma nova tentativa trouxer algum campo que antes estava vazio,
      // completamos apenas as células que agora possuem informação.
      writeRecord_(sheet, existingRow, record, false);
      return jsonResponse_({
        ok: true,
        duplicate: true,
        row: existingRow,
        occurrence_key: occurrenceKey
      });
    }

    const row = findWritableRow_(sheet);
    writeRecord_(sheet, row, record, true);

    sheet.getRange(row, 3).setNote(SPX_DV_CONFIG.notePrefix + occurrenceKey);
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

function writeRecord_(sheet, row, record, overwriteKnownFields) {
  // C — Pedido: sempre define a identidade da linha.
  if (overwriteKnownFields || !sheet.getRange(row, 3).getDisplayValue().trim()) {
    sheet.getRange(row, 3).setValue(record.shipmentId);
  }

  // D, E, F, G, I e J: só sobrescreve quando temos informação real.
  // Dessa forma, se algum campo não vier do SPX, uma fórmula existente pode permanecer.
  setIfKnown_(sheet, row, 4, record.reason);
  setIfKnown_(sheet, row, 5, numericIfSafe_(record.driverId));
  setIfKnown_(sheet, row, 6, record.driverName);
  setIfKnown_(sheet, row, 7, record.agency);
  setIfKnown_(sheet, row, 9, record.neighborhood);
  setIfKnown_(sheet, row, 10, record.occurrenceDate);
}

function setIfKnown_(sheet, row, column, value) {
  if (value === '' || value === null || value === undefined) return;
  sheet.getRange(row, column).setValue(value);
}

function numericIfSafe_(value) {
  const text = clean_(value);
  if (!/^\d+$/.test(text)) return text;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : text;
}

function findExistingOccurrenceRow_(sheet, shipmentId, occurrenceKey) {
  const marker = SPX_DV_CONFIG.notePrefix + occurrenceKey;
  const maxRows = Math.max(sheet.getMaxRows(), 2);
  const range = sheet.getRange(2, 3, maxRows - 1, 1);

  const matches = range.createTextFinder(shipmentId)
    .matchEntireCell(true)
    .matchCase(false)
    .findAll();

  for (const cell of matches) {
    if (String(cell.getNote() || '') === marker) return cell.getRow();
  }
  return 0;
}

function findWritableRow_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const stored = Number(properties.getProperty(SPX_DV_CONFIG.pointerProperty) || 0);

  let row = Number.isInteger(stored) && stored >= 2
    ? stored
    : findRowAfterLastGreen_(sheet);

  if (row < 2) row = 2;

  while (true) {
    ensureRowExists_(sheet, row);

    // A linha verde representa fim de recebimento e nunca recebe BR.
    if (isGreenSeparatorRow_(sheet, row)) {
      row += 1;
      continue;
    }

    // C é a única referência de ocupação. Fórmula que exibe vazio conta como vazia.
    const displayValue = String(sheet.getRange(row, 3).getDisplayValue() || '').trim();
    if (!displayValue) return row;

    // Linha preenchida manualmente ou automaticamente: pula.
    row += 1;
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

function isGreenSeparatorRow_(sheet, row) {
  // A linha de fechamento é pintada inteira. A coluna A é suficiente para
  // reconhecer o separador sem ler dez células a cada recebimento.
  return isGreenColor_(sheet.getRange(row, 1).getBackground());
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
