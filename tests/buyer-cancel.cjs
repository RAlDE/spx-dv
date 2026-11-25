// Rode na raiz do repositório: node tests/buyer-cancel.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = fs.readFileSync('modules/assistente-de-devolucoes/assistente.js', 'utf8');
function implementation(name) {
  const pattern = new RegExp('^  (?:async )?function ' + name + '\\([\\s\\S]*?^  \\}', 'm');
  const match = source.match(pattern);
  assert.ok(match, name);
  return match[0];
}

async function run() {
  const br = 'BRTEST001';
  const sheet = 'https://buyer.invalid/exec';
  const calls = [];
  let retcode = 0;
  let modal = false;
  const result = { style: {} };
  const button = {
    dataset: {},
    closest: selector => ({
      '[data-action]': button, '.actions': actions, '#panel': panel
    })[selector] || null,
    blur() {},
    remove() {}
  };
  const actions = {
    dataset: {},
    querySelector: selector => selector === '.result' ? result : button,
    querySelectorAll: () => [button]
  };
  const panel = { dataset: { shipmentId: br }, querySelector: () => actions };
  const context = vm.createContext({
    authorized: true, currentShipment: br, PANEL_ID: 'panel',
    ADDRESS_REASON_ID: 'ER40', ADDRESS_REASON_DESC: 'Onhold with Delivery Address Issue',
    SHEET_WEBAPP_URL: sheet, autoCancelledAddress: new Set(),
    document: { getElementById: () => panel },
    window: { setTimeout() {} }, setTimeout, clearTimeout, AbortController,
    cookie: () => '', isTargetRoute: () => true, findInput: () => ({ value: br }),
    hasMidwayInterceptModal: () => modal,
    markAddressCancelled() {}, captureCancelledAddressToDashboard() {},
    refreshReceivedAtFromTracking() {}, restoreTrackingFocus() {},
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === sheet) {
        assert.equal(init.method, 'POST');
        assert.deepEqual(Object.keys(body), ['br']);
        calls.push(['BUYER', body.br]);
        return { type: 'opaque' };
      }
      calls.push([url.split('/').pop(), body.shipment_id]);
      return { ok: true, json: async () => ({ retcode }) };
    }
  });
  const names = ['fetchJson', 'postJson', 'sendCancelledAddressToSheet',
    'handleAction', 'autoCancelAddressIfNeeded', 'checkShipment'];
  vm.runInContext(names.map(implementation).join('\n'), context);
  const click = action => {
    button.dataset.action = action;
    return context.handleAction({ target: button });
  };
  const checkCalls = (...expected) => {
    assert.deepEqual(calls.splice(0), expected.map(name => [name, br]));
  };

  context.checkShipment(true);
  await context.autoCancelAddressIfNeeded(br);
  checkCalls();
  await click('confirm');
  checkCalls('resolve_reason');

  retcode = 1;
  await click('cancel');
  checkCalls('cancel_eo_reason');
  modal = true;
  await context.autoCancelAddressIfNeeded(br);
  checkCalls('cancel_eo_reason');

  retcode = 0;
  await click('cancel');
  checkCalls('cancel_eo_reason', 'BUYER');
  context.checkShipment(true);
  checkCalls();
  // Outra tratativa concluída para o mesmo BR precisa de outra linha.
  await context.autoCancelAddressIfNeeded(br);
  checkCalls('cancel_eo_reason', 'BUYER');
  await context.autoCancelAddressIfNeeded(br);
  checkCalls();

  // Se o envio migrar para o recebimento comum, este teste deve falhar.
  assert.doesNotMatch(implementation('processConfirmedReceive'), /SHEET_WEBAPP_URL|syncAddressReceipt|sendCancelledAddressToSheet/);
}

run().then(() => console.log('OK: BUYER após cancelamento manual/automático e novo ciclo do mesmo BR.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
