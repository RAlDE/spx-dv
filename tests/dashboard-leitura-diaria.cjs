// Rode na raiz do projeto com node tests/dashboard-leitura-diaria.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const zone = 'America/Sao_Paulo';
process.env.TZ = zone;
const today = '2026-11-25';
const todayStart = Date.parse(today + 'T00:00:00-03:00');
const dayMs = 86400000;
const dateFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: zone});
const clock = new Intl.DateTimeFormat('en-GB', {timeZone: zone, dateStyle: 'short', timeStyle: 'medium'});
const script = fs.readFileSync('apps-script/recebimento-onhold-dados.gs', 'utf8');

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [todayStart + 3600000])); }
}

let rows = [];
let cellsRead = 0;
let dayCalls = 0;
const sheet = {
  isSheetHidden: () => true,
  getLastRow: () => rows.length + 1,
  getRange(start, column, count, width) {
    assert.ok(start >= 2 && count > 0 && start + count <= rows.length + 2);
    cellsRead += count * width;
    return {getValues: () => rows.slice(start - 2, start - 2 + count).map(r => r.slice(column - 1, column - 1 + width))};
  }
};
const server = vm.createContext({
  Date: FixedDate,
  SpreadsheetApp: {openById: () => ({getSheetByName: () => sheet})},
  PropertiesService: {getScriptProperties: () => ({getProperty: () => '27'})},
  Utilities: {
    formatDate(date, timezone, pattern) {
      assert.equal(timezone, zone);
      if (pattern === 'dd/MM/yyyy HH:mm:ss') return clock.format(date).replace(',', '');
      assert.equal(pattern, 'yyyy-MM-dd');
      dayCalls++;
      return dateFormat.format(date);
    },
    parseDate(day, timezone, pattern) {
      assert.equal(timezone, zone);
      assert.equal(pattern, 'yyyy-MM-dd');
      return new FixedDate(day + 'T00:00:00');
    }
  }
});
vm.runInContext(script, server);

function record(i, millis, status = 'confirmed') {
  return ['BR' + i + '|' + i, '', millis, 'BR' + i, 'Endereço não encontrado', String(i % 25),
    'Motorista ' + i % 25, 'Frota', 'Centro', Math.floor((millis - dayMs) / 1000),
    'normal', i % 2 ? 'op-a' : 'op-b', status, millis];
}

function compareViews() {
  const daily = server.getDashboardLiveState(true, true);
  const full = server.getDashboardLiveState(true);
  assert.equal(daily.ok, true, daily.error);
  assert.equal(full.ok, true, full.error);
  for (const field of ['build_info', 'day_options_html', 'today_count', 'pending_today_count', 'operators_count',
    'old_pending_count', 'old_pending_rows_html', 'all_pending_count', 'top_html', 'confirmed_today_count']) {
    assert.equal(daily[field], full[field], field);
  }
  const expected = full.history.filter(r => r[0] === today);
  assert.deepEqual(Array.from(daily.history), Array.from(expected));
  return daily;
}

compareViews();
const count = 20409;
rows = Array.from({length: count}, (_, i) => {
  const millis = i >= count - 565 ? todayStart + (i + 1) * 1000 : todayStart - (count - i) * 60000;
  return record(i, millis, i >= count - 85 ? 'captured' : 'confirmed');
});
cellsRead = 0;
dayCalls = 0;
const sample = server.getDashboardLiveState(true, true);
assert.equal(sample.ok, true, sample.error);
assert.equal(sample.today_count, 565);
assert.equal(sample.all_pending_count, 85);
assert.equal(sample.operators_count, 2);
assert.equal(sample.history.length, 565);
assert.equal(cellsRead, count * 3 + 565 * 14);
assert.ok(dayCalls < 100, 'reaproveitar os dias em vez de formatar cada linha no servidor');
console.log('Leitura diária simulada: %d células, %d linhas na tela, %d conversões de dia.', cellsRead, sample.history.length, dayCalls);
compareViews();

// Mesma remessa em outro ciclo, datas divergentes, limite de meia-noite e pendências fora de ordem.
rows[0] = record(42, todayStart, 'captured');
rows[0][1] = '2026-11-24';
rows[1] = record(42, todayStart - 1, 'captured');
rows[1][1] = today;
rows[2] = record(55, 0);
rows[2][1] = today;
rows[3] = record(56, 0, 'captured');
rows[3][1] = new FixedDate(todayStart - dayMs);
rows[4] = record(57, todayStart - dayMs, 'cancelled');
const mixed = compareViews();
assert.equal(mixed.today_count, 567);
assert.equal(mixed.old_pending_count, 2);
assert.equal(mixed.all_pending_count, 88);
assert.match(mixed.old_pending_rows_html, /BR42/);
assert.match(mixed.old_pending_rows_html, /BR56/);
assert.doesNotMatch(mixed.old_pending_rows_html, /BR57/);
// Pendências dispersas acionam a leitura de um bloco contínuo.
for (let i = 100; i < 1500; i += 100) rows[i][12] = 'captured';
compareViews();
const resolveDay = server.dashboardReadDayResolver_();
for (const transition of ['2018-11-04T03:00Z', '2019-02-17T02:00Z']) {
  for (let minutes = -360; minutes <= 360; minutes += 7) {
    const millis = Date.parse(transition) + minutes * 60000;
    assert.equal(resolveDay(millis, ''), dateFormat.format(new Date(millis)));
  }
}
console.log('OK: histórico completo, data do recebimento, pendências antigas e intervalos esparsos.');
