const CATALOG_URL = 'https://raw.githubusercontent.com/RAlDE/spx-dv/main/catalog.json';
const STATE_PREFIX = 'spxdv:module:';

chrome.runtime.onInstalled.addListener(() => syncEnabledModules().catch(console.error));
chrome.runtime.onStartup.addListener(() => syncEnabledModules().catch(console.error));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_CATALOG') {
    getCatalog().then(catalog => sendResponse({ ok: true, catalog })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'GET_MODULE_STATE') {
    getModuleState(String(message.moduleId || '')).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'SET_MODULE_STATE') {
    setModuleState(String(message.moduleId || ''), message.enabled === true).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

async function getCatalog() {
  const response = await fetch(`${CATALOG_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar o catálogo (HTTP ${response.status}).`);
  const catalog = await response.json();
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.modules)) throw new Error('Catálogo inválido.');
  return catalog;
}

async function ensureUserScripts() {
  if (!chrome.userScripts) throw new Error('Ative “Permitir scripts de usuário” nos detalhes da extensão.');
  try { await chrome.userScripts.getScripts(); }
  catch { throw new Error('Ative “Permitir scripts de usuário” nos detalhes da extensão.'); }
}

async function getModuleState(moduleId) {
  await ensureUserScripts();
  const key = `${STATE_PREFIX}${moduleId}`;
  const stored = await chrome.storage.local.get({ [key]: false });
  const scripts = await chrome.userScripts.getScripts();
  return { ok: true, enabled: stored[key] === true, registered: scripts.some(script => script.id.startsWith(`${moduleId}:`)) };
}

async function setModuleState(moduleId, enabled) {
  await ensureUserScripts();
  const catalog = await getCatalog();
  const module = catalog.modules.find(item => item.id === moduleId && item.enabled !== false);
  if (!module) throw new Error('Módulo não encontrado ou desativado.');
  await unregisterModule(moduleId);
  if (enabled) await registerModule(module);
  await chrome.storage.local.set({ [`${STATE_PREFIX}${moduleId}`]: enabled });
  await reloadMatchingTabs(module.matches || []);
  return { ok: true, enabled };
}

async function registerModule(module) {
  const registrations = [];
  for (const script of module.scripts || []) {
    const response = await fetch(`${script.url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao baixar ${script.id}.`);
    registrations.push({
      id: `${module.id}:${script.id}`,
      matches: module.matches,
      js: [{ code: await response.text() }],
      runAt: script.runAt || 'document_idle',
      world: script.world || 'MAIN',
      allFrames: false
    });
  }
  if (!registrations.length) throw new Error('O módulo não possui scripts.');
  await chrome.userScripts.register(registrations);
}

async function unregisterModule(moduleId) {
  const scripts = await chrome.userScripts.getScripts();
  const ids = scripts.filter(script => script.id.startsWith(`${moduleId}:`)).map(script => script.id);
  if (ids.length) await chrome.userScripts.unregister({ ids });
}

async function reloadMatchingTabs(patterns) {
  const tabs = [];
  for (const pattern of patterns) tabs.push(...await chrome.tabs.query({ url: pattern }));
  const ids = [...new Set(tabs.map(tab => tab.id).filter(Boolean))];
  await Promise.all(ids.map(id => chrome.tabs.reload(id).catch(() => {})));
}

async function syncEnabledModules() {
  await ensureUserScripts();
  const catalog = await getCatalog();
  const states = await chrome.storage.local.get(catalog.modules.map(module => `${STATE_PREFIX}${module.id}`));
  for (const module of catalog.modules) {
    if (states[`${STATE_PREFIX}${module.id}`] === true && module.enabled !== false) {
      await unregisterModule(module.id);
      await registerModule(module);
    }
  }
}
