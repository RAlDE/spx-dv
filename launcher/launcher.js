fetch('../catalog.json', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(catalog => {
    const root = document.getElementById('modules');
    root.textContent = '';
    catalog.modules.forEach(module => {
      const card = document.createElement('article'); card.className = 'card';
      const title = document.createElement('h2'); title.textContent = module.name;
      const description = document.createElement('p'); description.textContent = module.description;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `Versão ${module.version} · ${module.enabled ? 'Disponível' : 'Desativado'}`;
      card.append(title, description, meta); root.appendChild(card);
    });
  })
  .catch(error => { document.getElementById('modules').textContent = `Não foi possível carregar o catálogo: ${error.message}`; });
