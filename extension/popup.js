const modulesElement = document.getElementById('modules');

chrome.runtime.sendMessage({ type: 'GET_CATALOG' }, async response => {
  if (!response?.ok) return showError(response?.error || 'Não foi possível carregar o catálogo.');
  modulesElement.textContent = '';
  for (const module of response.catalog.modules.filter(item => item.enabled !== false)) {
    modulesElement.appendChild(await createModuleCard(module));
  }
});

async function createModuleCard(module) {
  const card = document.createElement('section');
  card.className = 'module';
  const title = document.createElement('h2'); title.textContent = module.name;
  const description = document.createElement('p'); description.textContent = module.description;
  const row = document.createElement('div'); row.className = 'row';
  const status = document.createElement('span'); status.className = 'status'; status.textContent = 'Verificando...';
  const button = document.createElement('button'); button.type = 'button'; button.disabled = true;
  row.append(status, button); card.append(title, description, row);
  const state = await send({ type: 'GET_MODULE_STATE', moduleId: module.id });
  if (!state?.ok) { status.textContent = state?.error || 'Permissão necessária'; button.textContent = 'Indisponível'; return card; }
  renderState(button, status, state.enabled); button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = 'Atualizando...';
    const result = await send({ type: 'SET_MODULE_STATE', moduleId: module.id, enabled: !button.classList.contains('active') });
    if (result?.ok) renderState(button, status, result.enabled); else status.textContent = result?.error || 'Falha ao atualizar';
    button.disabled = false;
  });
  return card;
}

function renderState(button, status, enabled) {
  button.classList.toggle('active', enabled);
  button.textContent = enabled ? 'Ativado' : 'Desativado';
  status.textContent = enabled ? 'Executando no SPX' : 'Clique para ativar';
}
function send(message) { return new Promise(resolve => chrome.runtime.sendMessage(message, resolve)); }
function showError(message) { modulesElement.textContent = ''; const error = document.createElement('p'); error.className = 'error'; error.textContent = message; modulesElement.appendChild(error); }
