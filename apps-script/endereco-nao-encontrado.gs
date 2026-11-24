// Projeto Apps Script da planilha de endereço. Usar a implantação existente.
const SPREADSHEET_ID = '1Qa8bCGEdO9moAa4nIZwcyxrQiD3hEbwWxfuYh8L9jGw';
const CONTROL = '_SPX_ENDERECO_RECIBOS';
const MONTHS = 'JANEIRO FEVEREIRO MARÇO ABRIL MAIO JUNHO JULHO AGOSTO SETEMBRO OUTUBRO NOVEMBRO DEZEMBRO'.split(' ');

function reply(value, cb) {
  const json = JSON.stringify(value);
  if (/^__spxDvCentral_[A-Za-z0-9_]+$/.test(cb || '')) {
    return ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function receipt(br, time) {
  br = String(br || '').trim().toUpperCase();
  if (!/^BR[A-Z0-9]+$/.test(br)) throw Error('BR inválido');
  const ms = Number(time);
  if (!Number.isSafeInteger(ms) || ms < 1000000000000 || ms > Date.now() + 300000) throw Error('Horário inválido');
  return {br, ms, key: br + '|' + ms};
}

function doGet(e) {
  const p = e && e.parameter || {};
  if (p.view !== 'receipt') return reply({ok:true, service:'SPX-DV Endereço', status:'online'});
  try {
    const r = receipt(p.br, p.received_at);
    const ledger = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONTROL);
    const cell = ledger && ledger.getRange('A:A').createTextFinder(r.key).matchEntireCell(true).findNext();
    const done = cell && ledger.getRange(cell.getRow(),5).getValue() === 'OK';
    return reply({ok:Boolean(done), key:r.key}, p.callback);
  } catch (err) { return reply({ok:false}, p.callback); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    const legacy = body.received_at === undefined;
    const r = receipt(body.br, legacy ? Date.now() : body.received_at);
    lock.waitLock(30000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tz = ss.getSpreadsheetTimeZone() || 'America/Sao_Paulo';
    const [day,month,year] = Utilities.formatDate(new Date(r.ms),tz,'dd/MM/yyyy').split('/');
    const sheet = ss.getSheetByName(MONTHS[Number(month)-1] + ' ' + year);
    if (!sheet) throw Error('Aba do mês ausente');
    const col = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].findIndex(v => v.trim() === day+'/'+month)+1;
    if (!col) throw Error('Coluna do dia ausente');
    let ledger = ss.getSheetByName(CONTROL);
    if (!ledger) {
      ledger = ss.insertSheet(CONTROL);
      ledger.appendRow(['Recibo','Aba','Coluna','Linha','Estado']);
      ledger.hideSheet();
    }
    const rows = ledger.getDataRange().getValues();
    const ix = legacy ? -1 : rows.findIndex(row => row[0] === r.key);
    if (ix >= 0 && rows[ix][4] === 'OK') return reply({ok:true,key:r.key});
    let dest, controlRow;
    if (ix >= 0) {
      if (rows[ix][1] !== sheet.getName() || rows[ix][2] !== col) throw Error('Reserva divergente');
      dest = rows[ix][3];
      controlRow = ix+1;
    } else {
      const vals = sheet.getRange(3,col,Math.max(1,sheet.getLastRow()-2),1).getDisplayValues();
      dest = 3;
      vals.forEach((v,i) => { if (v[0].trim()) dest = i+4; });
      rows.forEach(row => { if (row[1] === sheet.getName() && row[2] === col && row[4] === 'PENDENTE') dest = Math.max(dest,Number(row[3])+1); });
      controlRow = ledger.getLastRow()+1;
      ledger.getRange(controlRow,1,1,5).setValues([[legacy ? Utilities.getUuid() : r.key,sheet.getName(),col,dest,'PENDENTE']]);
      SpreadsheetApp.flush();
    }
    if (dest > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),dest-sheet.getMaxRows());
    const cell = sheet.getRange(dest,col);
    const old = cell.getDisplayValue();
    if (old && old !== r.br) throw Error('Célula reservada foi ocupada');
    if (!old) cell.setValue(r.br);
    SpreadsheetApp.flush();
    if (cell.getDisplayValue() !== r.br) throw Error('Gravação não confirmada');
    ledger.getRange(controlRow,5).setValue('OK');
    SpreadsheetApp.flush();
    return reply({ok:true,br:r.br,cell:cell.getA1Notation()});
  } catch(err) { return reply({ok:false,error:String(err.message || err)}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
