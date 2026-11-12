# SPX-DV — HANDOFF CRÍTICO: Return, duplicidade, recibos e filtros
**Data da investigação:** 11/11/2026 — fuso `America/Sao_Paulo`  
**Repositório:** `RAlDE/spx-dv` — branch `main`  
**Estado:** **SOMENTE DIAGNÓSTICO E DOCUMENTAÇÃO. NÃO IMPLEMENTAR MODIFICAÇÕES ATÉ NOVA AUTORIZAÇÃO DO USUÁRIO.**

> Este handoff é a primeira leitura obrigatória na próxima conversa. A pedido do usuário, a investigação atual **não alterou módulo, Apps Script, catálogo, versões, receive-hook, planilha nem registros operacionais**. Somente documentos Markdown do Git podem ser adicionados/atualizados para continuidade. O usuário pretende utilizar outra conversa com raciocínio mais alto.

## 1. Leitura obrigatória e estado de referência

Ler **nesta ordem**, antes de qualquer alteração:
1. `HANDOFF_2026-11-11_PENDENCIAS_RETURN_DASHBOARD.md` (este documento).
2. `PROJECT_MASTER_CONTEXT.md` — regras históricas; **versões antigas dentro do mestre são históricas**, não o build atual.
3. `PROJECT_CONTEXT.md` — especialmente as seções 1.3.39, 1.3.58, 1.3.62, 1.3.64 a 1.3.69 e o apontamento deste handoff.
4. `HANDOFF_CONVERSA_2026-11-04.md` — histórico e decisões até 1.3.65; **não confundir versão registrada ali com a atual**.
5. `README.md`, `catalog.json`, `modules/assistente-de-devolucoes/assistente.js`, `modules/assistente-de-devolucoes/receive-hook.js`, `apps-script/recebimento-onhold-dados.gs`.
6. Buscar novamente o SHA real dos arquivos no Git antes de propor mudanças.

**Builds conferidos no Git nesta investigação:**
- `MODULE_VERSION = 1.3.69`; `catalog.json.modules[0].version = 1.3.69`.
- `DASHBOARD_SYNC_GENERATION = 1.3.68`; `SPX_DV_BUILD = 1.3.68` no Apps Script — **diferença intencional** da atualização somente do módulo na 1.3.69.
- SHAs de referência (podem mudar): módulo `0a5f017507a99b0f0591c1022d855fbe78785d2f`; Apps Script `1d1e032849fb67b9c0b4641e7335897dd59e9067`; receive-hook `eed85bbbb1aa822c9bf6771ca655d5a8dd2832eb`; catálogo `cacf21a994c616755d411300b59773912cbe8723`.
- O SPX-DV é **separado** de SPX OnHold e outros projetos. Não tocar em outros repositórios.

**Validações reais que NÃO podem regredir:**
- Usuário confirmou captura integral dos **440 BRs** no Dashboard com o mecanismo 1.3.65.
- Envio em massa da 1.3.58 e posteriores confirmado em produção: **somente C:G e I:J**, sem tocar A/B/H, linhas verdes, fórmulas/formatos e entradas manuais. O usuário reafirmou em 11/11 que todos os registros **que estavam no Dashboard** foram enviados corretamente.
- Bairro normal: Google geolocalização do comprador; fallback **Bairro Principal** da AT (1.3.62 validada). Return: **geolocalização do VENDEDOR** `trade_info.data.seller_info.seller_geo_lat/lng`, fallback Bairro Principal da AT vinculada. 3PL obtida da Agência da AT válida.
- Consulta/preview não é recebimento: captura normal depende da resposta real `retcode=0` de `POST /api/in-station/uni_receive/order`, salvo a exceção já documentada e validada de **Endereço não encontrado**; não criar registros a partir apenas de eventos do rastreio.
- Deduplicação operacional atual `occurrence_key = BR + occurrence_timestamp`; **não confundir ocorrência histórica distinta com nova confirmação de recebimento**. A necessidade abaixo é corrigir o vínculo *recibo físico ↔ ocorrência* sem apagar ocorrências históricas legítimas.

## 2. Proveniência das evidências (separar o que é comprovado do que é relato)

**Relato do usuário e telas nesta conversa:** três capturas (painel SPX-DV Return; Dashboard de 11/11 com 738 recebidos e filtro de BR ausente; Dashboard de 10/11 com 1240 recebidos e duas linhas do mesmo BR); dois vídeos enviados pelo usuário:
- `20261112-0123-30.8223449.mp4` (~30 s): tela SPX Receiver/Sender Info, BR267073684559J; evento `Retorno_Recebido_LMHub` em **11/11/2026 06:28:06** posterior a `Retorno_LMHub_Em_Espera` em **10/11/2026 16:08:10**. Também aparecem atribuições/saídas e eventos posteriores.
- `20261112-0142-31.4449675.mp4` (~26 s): tela SPX Receiver/Sender Info, BR267803637465O; evento `Retorno_Recebido_LMHub` em **11/11/2026 11:55:32**, após `Retorno_LMHub_Em_Espera` em **10/11/2026 08:35:44**; em seguida aparecem `Devolução_Falhou` e `Liquidando`.

**Importante:** estes vídeos/imagens foram fornecidos na conversa e **não foram copiados para o Git**, para evitar publicar material operacional e dados pessoais. Em um novo chat, pedir ao usuário reenvio somente se indispensável; os fatos e horários úteis estão transcritos aqui. A transcrição de imagem/vídeo mostra o **estado do rastreio visual**, não a resposta bruta de `tracking_info` nem o recibo de `uni_receive/order`.

**Auditoria de leitura (sem escrita) na planilha central:**
- ID conhecido pelo projeto: `14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY`.
- Abas: `_SPX_DV_DASHBOARD` (registros/ocorrências), `_SPX_DV_CONTROLE` (chave → linha) e `Dados` (envio final).
- As observações de leitura abaixo são um **retrato de 11/11/2026**, não garantem que não tenham mudado posteriormente. Não houve nenhuma alteração nesses dados durante esta investigação.
- Não copiar cookies, tokens, endereços, nomes de compradores/vendedores ou respostas brutas sensíveis para repositório público.

## 3. P0 — INTEGRIDADE: BR261747784244S aparece duas vezes com UM recebimento relatado

O usuário confirmou que **foi recebido apenas uma vez**. A tela filtrada em **10/11/2026** mostrou **duas linhas do mesmo BR**, com mesmo `Recebido em = 10/11/2026 04:56:03`, mas ocorrência/motivo/motorista distintos:

| Item | Registro A | Registro B |
| --- | --- | --- |
| BR | BR261747784244S | BR261747784244S |
| Linha `_SPX_DV_DASHBOARD` | **4707** | **5346** |
| Chave `occurrence_key` | `BR261747784244S\|1794311212` | `BR261747784244S\|1794231108` |
| `received_at` | **10/11/2026 04:56:03** | **10/11/2026 04:56:03** |
| Data/hora da ocorrência | **10/11/2026 08:46:52** | **09/11/2026 10:31:48** |
| Motivo | Ausente | Problemas Mecânicos |
| Status | confirmed | confirmed |
| Linha em `_SPX_DV_CONTROLE` | **8651** | **8652** |
| `dados_row` gravada no controle | **270471** | **270472** |

**Inconsistência temporal objetiva:** ocorrência A às **08:46:52** é **posterior em 3h50m49s** ao mesmo recebimento às **04:56:03**; não pode representar a ocorrência que motivou aquele recebimento se os relógios forem comparáveis e corresponderem à mesma operação. Verificar timezone e unidade, mas não explicar como erro de fuso sem prova.

**Inconsistência referencial grave, confirmada por leitura direta de `Dados`:**
- Controle da ocorrência A aponta para `Dados!270471`: a coluna C **é o mesmo BR**, porém motivo = **Problemas Mecânicos** e Driver ID = **4269325** (isto corresponde aos dados da ocorrência B, não A).
- Controle da ocorrência B aponta para `Dados!270472`: a coluna C é **BR269771956620M**, **outro BR**, não BR261747784244S.
- Portanto, não é apenas duplicidade visual: `_SPX_DV_CONTROLE` também possui referências de linha incompatíveis. O controle marcar `confirmed` não prova, sozinho, que o registro correto esteja naquela linha. **Não corrigir, excluir, reenviar nem ajustar G automaticamente antes de conciliar as chaves e os destinos.**

**Hipótese técnica relevante, ainda NÃO demonstrada:** `processConfirmedReceive()` seleciona `visibleAttempts.at(-1)` (última ocorrência disponível **no momento da consulta**), independentemente do `receivedAt` original. Em tentativas/reprocessamentos posteriores pode vincular **um mesmo recibo antigo a uma ocorrência mais recente**, inclusive futura ao recibo. A chave BR+timestamp então permite duas chaves diferentes para o mesmo recebimento. Outras causas possíveis: reprocessamento de inbox, resposta tardia, migração local, concorrência ou drift de linhas após gravação. NÃO concluir a causa sem logs.

**Investigar primeiro:** qual rotina criou as chaves A/B, `receive_key`, `received_at`, `process_occurrence_ready`, `central_send_confirmed`, `confirmedReceiveSeen`, fila durável, `findWritableRows_`, `groupConsecutiveAssignments_`, `appendControlAssignments_` e eventuais edições/ordenação na aba Dados. Fazer auditoria de correspondência `occurrence_key → Dados!C/E/D/I/J` sobre uma amostra antes de qualquer reenvio.

## 4. P1 — Return BR267073684559J: recebido no rastreio e em Dados, mas caixa mostra travessão e não informa 3PL/Bairro

**Tela da extensão 1.3.69 (11/11):**
- BR `BR267073684559J`; motivo Return **Fora de Rota**, ocorrência **10/11/2026 16:08:10**.
- Cabeçalho da caixa: **`Recebido em: —`**.
- **3PL ausente** e **`Bairro: Atualizar base`**.
- Vídeo confirma evento visível `Retorno_Recebido_LMHub` em **11/11/2026 06:28:06**, após essa ocorrência.

**Leitura direta da base central:** `_SPX_DV_DASHBOARD` linha **6155**, chave `BR267073684559J|1794337690`; `received_day=2026-11-11`, `received_at=11/11/2026 06:28:06`, status **confirmed**, 3PL **vazia**, Bairro **Quinta dos Acorianos**. O `_SPX_DV_CONTROLE` linha **10083** aponta `Dados!271902`; ali a **3PL já aparece como SPXOWNFLEET** e o bairro é Quinta dos Acorianos.

**Conclusão factual:** **o horário 06:28:06 existe no Dashboard e corresponde ao vídeo**, porém não aparece na caixa. A 3PL está vazia no Dashboard mas preenchida em Dados, e o Bairro está resolvido no Dashboard/Dados mas não na caixa. Há **divergência entre fontes e tempos de atualização**; não assumir que a 3PL de Dados seja a mesma AT validada sem conferir a procedência.

**Hipóteses a verificar:** `tracking_info` pode não expor o mesmo evento que a tela Receiver/Sender Info; `trackingEventsChronological` varre apenas `tracking?.data?.tracking_list`; o status pode estar aninhado noutra estrutura, ou a busca pode estar usando a ocorrência errada/um ciclo posterior. A correção sintética 1.3.69 de `Retorno_Recebido_LMHub` **não resolveu o caso real**, apesar de passar nos testes sintéticos. Verificar o retorno efetivo da API e os eventos `tracking_received_at_found` / `return_tracking_received_visible`.

**3PL/Bairro:** consultar `return_assignment_cycles_missing`, `return_assignment_ids_missing`, `return_agency_no_matching_at`, `assignment_lookup_resolved/empty/error`, `return_seller_geo_missing`, `geo_neighborhood_lookup`. Não inferir 3PL apenas pelo Driver ID e não usar GEO do comprador no Return.

## 5. P1 — Return BR267803637465O: filtro de 11/11 não encontra o recebimento mostrado no histórico

**Tela do Dashboard 11/11:** pesquisa de BR267803637465O no filtro de Pedido resulta em **“Nenhum valor encontrado”**, com **738 registros de 11/11** naquele retrato. Usuário diz que foi recebido em 11/11 no evento marcado com cursor.

**Vídeo SPX:** Return `Retorno_LMHub_Em_Espera` de **10/11 08:35:44** e `Retorno_Recebido_LMHub` de **11/11/2026 11:55:32**, seguido por `Devolução_Falhou` e `Liquidando`.

**A auditoria de leitura mostrou duas ocorrências ANTIGAS no central e em Dados, não uma nova em 11/11:**
- `_SPX_DV_DASHBOARD` linha **3035**, `BR267803637465O|1794077725`, `received_day=2026-11-08`, `received_at=08/11 05:44:02`, ocorrência 07/11 15:55:25, Return Comércio Fechado, 3PL vazia, Bairro São Domingos. Controle 6967 → `Dados!268767`, onde G está preenchida SPXOWNFLEET.
- `_SPX_DV_DASHBOARD` linha **4411**, `BR267803637465O|1794150112`, `received_day=2026-11-09`, `received_at=09/11 12:21:38`, ocorrência 08/11 12:01:52, Return Comércio Fechado, 3PL vazia, Bairro Atualizar base. Controle 8349 → `Dados!270150`, onde G está preenchida SPXOWNFLEET.
- Nenhuma linha para esse BR com `received_day=2026-11-11` foi localizada na aba central durante a leitura. Portanto a mensagem do filtro de **11/11** era consistente com a base lida naquele momento — mas **a captura associada ao evento 11/11 continua sem explicação**.

**Separar três possibilidades:** (a) `retcode=0` do recebimento 11/11 foi capturado e perdido antes do Dashboard; (b) SPX atualizou o estado do rastreio, mas a operação usada não passou pelo endpoint do hook; (c) havia outro caminho de operação, data ou identificador que deve ser reconciliado. Sem resposta bruta/hook, não afirmar qual ocorreu.

**Não inserir BR novo por ver a linha do rastreio.** Se houver recibo real, recuperar **a ocorrência do ciclo 11/11** com a chave correta e dedupe de recibo físico, sem confundir com as duas ocorrências legítimas antigas.

## 6. P2 — Filtros dinâmicos “em cascata” por conjunto atualmente filtrado

Regra solicitada: ao filtrar de 738 linhas para **5 linhas**, as opções **dos outros filtros** devem se ajustar aos valores realmente presentes **nessas 5 linhas**, mantendo pesquisa interna, opção **(Vazio)** e contagens coerentes.

**Comportamento atual confirmado no código:** `rebuildColumnOptions()` monta opções a partir dos registros da **data selecionada**, mas NÃO aplica filtro geral, operador nem os demais filtros ativos ao calcular as alternativas. Assim as listas permanecem com valores não presentes no resultado.

**Especificação recomendada (não implementar ainda):** para a coluna X, calcular opções nos registros que respeitam **data + operador + busca geral + filtros de todas as OUTRAS colunas** (*faceted filtering*, excluindo X de sua própria lista). Manter escolha ativa mesmo quando tiver contagem zero até o usuário limpá-la; manter o campo de pesquisa dentro do pop-up e o botão “Todos”; recomputar apenas a lista de opções, não o histórico original; tratar vazio real como opção válida; restaurar seleção sem limpar silenciosamente filtros em uso. Testar seleção de 5 linhas, múltiplos filtros, geral, operador, (Vazio), troca de data, limpeza e 1.000+ registros.

## 7. Risco de requisito contraditório — “somente ocorrências recebidas na caixa”

O usuário reafirmou: “**só é pra aparecer na caixa os que já foram recebidos**”. Entretanto o `PROJECT_MASTER_CONTEXT.md`, seções 18–20, exige preservar **todas as ocorrências reais válidas do ciclo Return** no histórico visual (e não colapsá-las por motivo/dia/horário). O `HANDOFF_CONVERSA_2026-11-04.md` também separa claramente *preview do histórico* de *captura confirmada*.

**Não reinterpretar nem apagar histórico na caixa sem esclarecer o escopo na nova conversa.** Uma alternativa a validar com o usuário é: a caixa pode mostrar o histórico da operação, mas deve destacar explicitamente **qual ocorrência foi efetivamente recebida** e impedir que ocorrências históricas não recebidas gerem linhas no Dashboard. Se o usuário exigir somente recebidas na caixa, isso altera regra histórica e precisa de aprovação conceitual explícita antes de editar.

## 8. Hipóteses técnicas e roteiro de investigação por prioridade

### P0 — isolar risco de dano na planilha (ANTES de corrigir código)
1. Somente leitura: congelar snapshot/backup conforme procedimento aprovado, sem alterar a planilha original. Conferir `_SPX_DV_DASHBOARD`, `_SPX_DV_CONTROLE`, `Dados` e fórmulas/formatos; identificar se há outras chaves → linhas erradas além deste BR.
2. Inspecionar `findWritableRows_`, `groupConsecutiveAssignments_`, `appendControlAssignments_`, eventual reordenação/edição da planilha e uso de ponteiro; reproduzir o mismatch 270471/270472 em teste local.
3. Desenhar estratégia segura de correção com **prévia/dry-run e reconciliação**, aprovação explícita do usuário, sem reenviar ou apagar BRs. `confirmed` é insuficiente quando chave e linha não batem.

### P1 — capturas e associação temporal
1. Obter diagnóstico **D / Copiar** da extensão no MESMO computador onde ocorreu o recebimento, procurando `receive_response_seen`, `receive_success_recognized`, `receive_receipt_persisted`, `receive_queued`, `receive_orders_from_request_body`, `process_start`, `process_occurrence_ready`, `central_send_confirmed`, `receive_capture_exhausted`, `receive_inbox_replay_*`.
2. Correlacionar `receive_key` / `received_at` de cada POST real com exatamente uma ocorrência elegível **existente até aquele instante**. Não usar cegamente `visibleAttempts.at(-1)` ao reprocessar recibos antigos. Não modificar hook sem evidência de onde ocorre a perda.
3. Testar dois recebimentos genuínos do mesmo BR **em momentos diferentes** (devem gerar duas linhas somente quando a regra histórica permitir) e **um** recebimento com múltiplas ocorrências antigas (deve gerar uma só associação).
4. Analisar Return com `tracking_info`, `recipient_info`, `trade_info` e tela Receiver/Sender Info comparando os horários/IDs, preservando privacidade. Verificar se `Retorno_Recebido_LMHub` está realmente em `tracking_list` e se o recorte temporal é o mesmo da ocorrência.
5. Verificar vínculo de AT pelo identificador **real** e Driver ID de retorno; GEO exclusivamente `seller_geo` para Return, fallback Bairro Principal da AT. Não adivinhar valores.

### P2 — filtro em cascata
1. Adicionar filtros por facetas conforme seção 6, sem tocar em captura, API, IDs ou envio.
2. Validar na interface com 5 linhas e com BR ausente por data, distinguindo “não encontrado na data” de “não existe no histórico”.

## 9. Matriz mínima de aceitação para eventual correção FUTURA

| Teste | Condição de aprovação |
| --- | --- |
| Return recebido exibido | Caixa exibe o horário real depois da ocorrência; não confunde histórico visual com retcode=0 |
| Return 3PL | Agência da AT comprovada, ou erro/diagnóstico conclusivo sem valor inventado |
| Return Bairro | GEO do vendedor → Google; se não resolver, Bairro Principal da AT vinculada; evitar “Atualizar base” como valor final quando a fonte existir |
| Único recibo | No máximo uma associação ativa para a mesma confirmação física, salvo exceção historicamente aprovada |
| Múltiplos recebimentos reais | Não eliminar ocorrências legitimamente separadas |
| Invariantes temporais | Nenhuma ocorrência futura ao recebimento escolhido; revisar relógios/fuso no diagnóstico |
| Controle ↔ Dados | `occurrence_key` aponta para o BR, Driver ID e ocorrência correspondentes na linha destino |
| Histórico | Nenhum recebimento válido desaparece após meia-noite ou troca de filtros |
| Filtros facetas | Opções e contagens acompanham resultados já filtrados, sem apagar seleção |
| Envio em massa | C:G/I:J somente, dedupe e linhas verdes preservados; nenhum dano ou mudança sem aprovação |

## 10. Instruções explícitas para a próxima conversa

- **O usuário pediu somente o REGISTRO no Git nesta conversa: NÃO mudar o sistema agora.**
- Não afirmar que a 1.3.69 está validada. O painel 1.3.69 ainda falhou em Return real.
- Priorizar correlação de recibos e integridade do controle, ANTES de UX. Não “corrigir” erro de controle preenchendo/transferindo células sem reconciliação.
- Antes de qualquer implementação, verificar novos SHAs e confirmar qual versão está realmente implantada no navegador, na extensão e no Apps Script.
- Distinguir claramente **fato observado**, **hipótese**, **risco de regressão** e **teste necessário**. O usuário exige postura crítica, antecipação e questionamento de divergências.
- Solicitar apenas os diagnósticos reais que ainda faltam (`D` / Copiar, resposta sanitizada do `uni_receive/order`), **não repetir pedidos de informações já presentes neste documento**.
- Nunca trabalhar de forma assíncrona nem prometer testes em produção que não foram executados.

**Fim — handoff preparado exclusivamente para continuidade e análise, não para publicação de nova versão.**
