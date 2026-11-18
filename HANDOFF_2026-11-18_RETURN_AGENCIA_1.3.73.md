# SPX-DV 1.3.73 — agência do motorista de Return via conferências

O rastreio dos casos coletados tem marcadores de atribuição sem número da AT. O usuário demonstrou o caminho BR → conferências → AT → motorista/agência, registrado integralmente em diagnostics/EVIDENCIA_CONFERENCIA_AT_BR262413570263G.md. Não pedir nova varredura desses endpoints.

## Alteração
- Preserva a consulta de AT explícita no rastreio. Corrige o aceite Return para exigir driver da resposta igual ao driver da ocorrência e não conflitante com driver do ciclo (antes OR permitia conflito).
- Para Return sem agência vinculada, usa GET audit/task/list filtrado por shipment_id, depois GET audit/target/list com BR e VT e POST assignment_task/search/v2 pelo target_id. Confere identidade exata da AT e driver_id da ocorrência.
- Só considera criação de VT e término da conferência do alvo anteriores ou iguais à ocorrência. Não escolhe simplesmente a VT atual. Transportadoras conflitantes não são preenchidas. Limites: cinco páginas por lista, cinco VTs candidatas, dez ATs por ocorrência; excesso gera diagnóstico sem preenchimento parcial.
- Cache de consultas BR/VT por60s, máximo100 BRs; compartilha promises entre preview e recebimento. Falhas não são guardadas como lista vazia. Não dispara requisição de recebimento nem bloqueia input do SPX; enriquecimento assíncrono pode demorar em rede lenta.
- Novo caminho preenche somente vínculo AT e agência, sem substituir motorista, motivo, ctime ou bairro. O bairro continua pelas fontes preexistentes. Não muda nenhuma rotina do Apps Script, escrita G, envio em massa, hook ou captura retcode=0.
- Diagnósticos return_agency_audit_match, return_agency_audit_no_match e return_agency_audit_error documentam resultado.

## Evidências e limites
BR262413570263G: ocorrência16/11 driver126922; imagem mostra AT20261116CX392 e SPXOWNFLEET. A resposta JSON dessa AT16 e seu alvo na VT16 não foram coletadas; portanto o sucesso automático deste caso exige validação real. AT17 driver456987 não pode preencher driver126922. Nova ocorrência18/11 driver101045 não herda agência dos anteriores.
A conferência representa vínculo histórico observado, e composição atual da AT pode não conter mais o BR. Agência retornada é a da resposta atual; não se comprova histórico imutável. Não é consulta ao cadastro direto de motorista. Sem conferência elegível ou com informações ambíguas, mantém sem identificação e diagnóstico.
Não corrige retroativamente duplicidades históricas nem recria recebimentos ausentes a partir do rastreio. BR267803637465O continua exigindo recibo original para recuperação autorizada e conciliada. O teste de resolução por VT16 usa dados simulados inspirados nas evidências, não validação real dessa resposta.

## Validação local
node --check modules/assistente-de-devolucoes/assistente.js
node tests/return-audit-agency.cjs
node tests/return-received.cjs
node tests/receipt-guard.cjs
node tests/diagnostico-filtros.cjs
node tests/rankings.cjs
Testes cobrem motorista divergente, alvo futuro, identidade AT não exata, falhas, cache e paginação incompleta; recepção, deduplicação, filtros e rankings existentes passam. Não chamar versão estável antes do SPX real.

## Atualização e teste operacional
Atualizar módulo para1.3.73 pelo atualizador usual. Nenhuma nova implantação GS exigida por este delta. Como o usuário adiou1.3.72, se ainda não implantou as correções de Dashboard/filtros/rankings/guarda de duplicidade publicadas antes, copiar apps-script/recebimento-onhold-dados.gs do main e atualizar a mesma implantação/URL. Build GS permanece1.3.68 por compatibilidade, não indica ausência das mudanças. Informar isso claramente ao usuário.
Validar primeiro consulta de BR Return já recebido: conferir driver, motivo, horário e agência; consulta não deve criar registro. Se agência faltar, enviar diagnóstico D/I atualizado (não repetir F12 inteiro). Depois um recebimento real, verificar uma ocorrência no Dash, correspondência do horário real e ausência de duplicação. Envio à planilha continua explícito pelo usuário. Nenhuma operação real ou célula alterada pelo agente nesta implementação.
