# PROJECT_CONTEXT — SPX-DV

Atualizado em: 2026-10-29
Repositório: RAlDE/spx-dv
Versão atual do módulo: 1.3.49
Estado: desenvolvimento incremental; 1.3.49 preserva a captura/gravação central validada e faz o Dashboard nascer com os dados já embutidos pelo servidor; requer validação visual real.

## LEIA PRIMEIRO — estado operacional atual e handoff para nova conversa

Esta seção é a fonte principal para retomar o projeto em uma conversa nova. O restante deste arquivo mantém o histórico cronológico das versões e decisões anteriores. Quando houver divergência entre uma seção antiga e este resumo, **prevalece o estado atual descrito aqui**, salvo se uma versão posterior documentar explicitamente uma nova mudança.

### Regra obrigatória antes de qualquer alteração
Antes de editar qualquer arquivo do SPX-DV:
1. reler este `PROJECT_CONTEXT.md` diretamente do GitHub;
2. buscar a versão atual de `modules/assistente-de-devolucoes/assistente.js`, `catalog.json` e, quando aplicável, `apps-script/recebimento-onhold-dados.gs`, `extension/manifest.json` e `extension/background.js`;
3. obter os SHAs atuais imediatamente antes de qualquer escrita;
4. preservar o comportamento já validado e fazer mudanças incrementais;
5. manter a versão do módulo e o `catalog.json` sincronizados;
6. registrar neste contexto o que foi alterado, o que foi apenas validado estaticamente e o que foi validado no SPX real;
7. **nunca chamar uma versão de estável sem validação real no SPX**.

Não misturar este repositório com **SPX OnHold**. SPX OnHold é outro projeto/repositório e possui regras próprias.

### Princípio central do recebimento
A arquitetura correta é:

`consulta/preview do BR -> recebimento real confirmado pelo SPX -> Dashboard/fila central -> revisão -> botão explícito Enviar X para a planilha -> aba Dados`

Regras que não podem ser quebradas:
- colar, digitar ou pressionar Enter no campo TN serve **somente para consulta/preview**;
- Enter/paste **não significa recebimento** e não pode criar ficha no Dashboard;
- o recebimento real é confirmado exclusivamente pela resposta de:
  `POST /api/in-station/uni_receive/order`
- somente considerar recebido quando `retcode = 0`;
- a resposta real fornece `data.task_operator` e `data.order_list[]` com `shipment_id` e `receive_time`;
- `received_at` deve vir do `receive_time` do próprio SPX;
- o Dashboard recebe somente ocorrências realmente recebidas;
- a aba `Dados` não recebe automaticamente por bip/Enter; a gravação é feita pelo botão explícito do Dashboard.

### Dashboard central e Apps Script
Web App atual:
`https://script.google.com/a/macros/shopee.com/s/AKfycbzVqz60x9ZBTt2dL83cxXaaHRMlqhEpU1r7AVlczQFmQSUdNGkyPUQcRsXzY17ImcbNOQ/exec`

Spreadsheet:
`14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY`

Aba oculta central:
`_SPX_DV_DASHBOARD`

Campos principais da fila:
- occurrence_key
- received_day
- received_at
- shipment_id
- reason
- driver_id
- driver_name
- agency
- neighborhood
- occurrence_timestamp
- flow
- operator_login
- status
- updated_at

O Dashboard deve manter:
- `Recebido em` antes do BR;
- Pedido/BR;
- Motivo do APP;
- Driver ID;
- Motorista;
- Transportadora 3PL;
- Bairro;
- Data da ocorrência;
- Login SPX;
- sem coluna técnica de Status na lista principal;
- Top 10 motoristas ofensores do dia;
- filtros/pesquisa por operador;
- pendências antigas visíveis e acionáveis;
- botão `Enviar X para a planilha`.

Retenção:
- recebidos do dia permanecem visíveis durante o dia, inclusive já enviados;
- na virada do dia, somente registros `confirmed` antigos podem ser removidos;
- pendentes/falhos/não confirmados **nunca** devem desaparecer automaticamente à meia-noite;
- limpeza manual remove somente já enviados/confirmados.

A aba `Dados` usa:
- C = Pedido/BR
- D = Motivo do APP
- E = Driver ID
- F = Motorista
- G = Transportadora 3PL
- I = Bairro
- J = Data da ocorrência
- A, B e H não devem ser alteradas;
- C controla ocupação da linha;
- linha verde é separador de lote e nunca recebe BR;
- entradas manuais devem ser preservadas;
- deduplicação autoritativa é BR + timestamp em `_SPX_DV_CONTROLE`.

Importante: editar `apps-script/recebimento-onhold-dados.gs` no GitHub **não publica o Web App**. Após qualquer alteração no Apps Script é necessário atualizar/reimplantar manualmente a mesma implantação, preservando a URL `/exec`.

### Histórico e regras de recomendação
Histórico base:
`GET /api/fleet_order/order/detail/recipient_info?shipment_id=<BR>&station_type=3`

Ocorrências:
`data.recipient.On_Hold`

Motivos válidos:
- endereço não encontrado
- palavra-chave incorreta ou não informada
- comércio fechado
- recusado por terceiros
- ausente

Motivos finais:
- não entregar
- mudança de endereço
- rejeitado pelo comprador

Recomendação:
- última ocorrência Fora de Rota -> `REALOCAR / FLEET`;
- qualquer motivo final -> `RETORNAR AO SOC`;
- 3 **dias distintos** com motivos válidos -> `RETORNAR AO SOC`;
- endereço pendente -> `TRATATIVA DE ENDEREÇO`;
- caso contrário -> `PROCESSAR PARA ENTREGA`.

Nunca transformar a regra de 3 dias distintos em 3 ocorrências.

### Fluxo normal x fluxo Return
Não misturar os ciclos.

Normal:
- `LMHub_Onhold`
- `Delivering`

Return:
- `Return_LMHub_Onhold` / UI `Retorno_LMHub_Em_Espera`
- `Return_LMHub_Returning` / UI `Retorno_LMHub_Retornando`

A primeira entrada real no Return marca a fronteira entre o ciclo normal antigo e o ciclo Return atual. Eventos posteriores de Return pertencem ao mesmo ciclo. Não usar códigos numéricos 128/124 como classificação global; eles já produziram falso positivo. A classificação Return deve continuar semântica/textual, usando os sinais reais do tracking.

A separação de ciclos foi validada no ambiente real na linha da v1.3.17.

Ocorrências legítimas no mesmo dia e com o mesmo motivo podem ser eventos distintos; não deduplicar por proximidade temporal.

### Motorista / Driver ID / Transportadora por ocorrência
A ocorrência normal é associada ao `Delivering`/Assignment Task imediatamente anterior.

O tracking contém mensagens como:
`Pedido adicionado à Assignment Task [AT...]`

A AT é consultada por:
`POST /spx_delivery/admin/assignment/assignment_task/search/v2`

Payload:
`{ assignment_task_id, pageno: 1, count: 20, search_type: 0 }`

A resposta fornece AT, motorista/Driver ID e agência/3PL. O módulo usa cache de AT e valida Driver ID. Em ocorrência sintética de Return, mostrar Operador quando disponível; não inventar motorista/3PL.

### Bairro — arquitetura atual
A solução por exportação CSV foi uma etapa intermediária e **não é mais a fonte principal**.

Descoberta confirmada em ambiente real:
`GET /api/fleet_order/order/detail/trade_info?shipment_id=<BR>`

Para BR normal:
- usar `data.buyer_info.buyer_geo_lat`
- usar `data.buyer_info.buyer_geo_lng`
- corresponde ao localizador superior da tela de detalhe, destinatário/comprador.

Para BR Return:
- usar `data.seller_info.seller_geo_lat`
- usar `data.seller_info.seller_geo_lng`
- corresponde ao localizador inferior, remetente/vendedor.

Não usar:
- `data.return_info.return_dest_geo_lat/lng` quando vier `0,0`.

A validação da v1.3.38 confirmou em casos reais que o reverse geocoding retornou o bairro correto tanto no normal quanto no Return.

Conversão atual:
`trade_info -> latitude/longitude -> Web App ?view=geo -> Apps Script Maps.newGeocoder().reverseGeocode -> Bairro`

O geocoder recebe somente latitude/longitude arredondadas; não recebe BR, nome, telefone ou endereço. O SPX-DV não persiste/cacheia o resultado do Google Maps no Apps Script.

Fallback atual a partir da v1.3.41:
- normal: pode tentar a cache central antiga `_SPX_DV_BAIRROS` se geolocalização/geocoder falhar;
- Return: **não usa mais `show_sensitive_data` nem qualquer campo sensível como fallback**;
- se o Bairro não for resolvido, o valor operacional passa a ser `Atualizar base`;
- `Atualizar base` segue normalmente para Dashboard e para `Dados`, como qualquer outro valor de Bairro;
- a exportação automática de Bairro está **DESLIGADA** (`NEIGHBOR_EXPORT_AUTO_ENABLED = false`);
- não criar tarefas de exportação de Bairro automaticamente.

A página `#/exceptionOnholdList`/exportação foi usada somente para investigar Bairro/Sort Code. Ela **nunca** deve ser usada como fonte de recebimento, `received_at`, status de recebimento ou Dashboard.

### Velocidade do Bairro — requisito operacional
O recebimento trabalha com muitos pacotes em sequência. O operador não pode ficar esperando Bairro.

Comportamento desejado:
- painel abre imediatamente;
- se o Bairro ainda não chegou, pode mostrar `Bairro: Consultando...`;
- o bip e o recebimento do SPX jamais podem ficar bloqueados pelo geocoder;
- o Bairro deve aparecer o mais próximo possível da abertura do painel.

Na v1.3.39 um vídeo real mostrou aproximadamente:
- novo BR em ~6,6 s do vídeo;
- painel com `Consultando...` em ~7,6 s;
- Bairro preenchido em ~9,4 s;
- cerca de 1,8 s entre painel visível e Bairro.

A v1.3.40 foi criada especificamente para reduzir esse atraso:
- `tracking_info` e `trade_info` começam imediatamente;
- assim que ambos chegam, o geocoding já começa;
- `recipient_info`, AT/3PL e demais cálculos continuam em paralelo;
- no recebimento real, o Bairro também começa antes do enriquecimento da AT;
- o resultado pré-carregado é reutilizado ao salvar no Dashboard para evitar uma segunda chamada na mesma captura.

**Situação atual:** v1.3.42 mantém a arquitetura/velocidade da 1.3.40, não usa campo sensível e, se nenhuma fonte resolver o Bairro, grava `Atualizar base` como valor operacional no Dashboard e em `Dados`. A 1.3.42 passou por validação estática/sintática e ainda requer validação real antes de ser chamada de estável.

### Fonte autoritativa por responsabilidade
Para evitar regressões, cada fonte tem um papel específico:

- `POST /api/in-station/uni_receive/order` -> **recebimento real**.
- `recipient_info` -> histórico `On_Hold`.
- `tracking_info` -> ciclo normal/Return, eventos, ATs e contexto operacional.
- `assignment_task/search/v2` -> motorista/Driver ID/agência da ocorrência.
- `trade_info` -> coordenadas buyer/seller para Bairro.
- Apps Script `?view=geo` -> reverse geocoding das coordenadas para nome do Bairro.
- Dashboard + botão explícito -> única passagem operacional da fila para `Dados`.
- `exceptionOnholdList`/export -> somente investigação histórica de Sort Code/Bairro; **não usar para recebimento**.

### Endereço não encontrado
O cancelamento automático do modal `Interceptado no Meio do Caminho` continua:
`POST /api/in-station/admin/common_site/eha/cancel_eo_reason`

Parâmetros:
- `reason_id = ER40`
- `reason_desc = Onhold with Delivery Address Issue`

A integração antiga de planilha relacionada ao cancelamento deve ocorrer apenas após cancelamento real bem-sucedido. Não usar esse fluxo para representar recebimento.

### Estado das versões mais recentes
- v1.3.17: separação Return validada em ambiente real.
- v1.3.18: abertura/reentrada nas rotas SPA de recebimento validada.
- v1.3.19+: enriquecimento por AT/3PL por ocorrência.
- v1.3.27: confiabilidade do envio antigo/Apps Script melhorada.
- v1.3.32: Dashboard central e reconciliação com `_SPX_DV_CONTROLE`.
- v1.3.36: recebimento real por `/uni_receive/order`, Dashboard como fila e envio explícito em lote para Dados.
- v1.3.37: diagnóstico das coordenadas buyer/seller.
- v1.3.38: reverse geocoding testado manualmente e retornou bairro correto em normal e Return.
- v1.3.39: Bairro geográfico passou a ser fonte operacional; vídeo real confirmou funcionamento, mas mostrou atraso visual perceptível.
- v1.3.40: geocoding antecipado/paralelo para reduzir esse atraso; teste real indicou velocidade operacional aceitável.
- v1.3.41: remove completamente o fallback de Bairro por `show_sensitive_data`.
- v1.3.42: se geolocalização/cache não resolverem o Bairro, usa `Atualizar base` como valor real e envia ao Dashboard/Dados.
- v1.3.43: adiciona hook mínimo em `document_start` para capturar o recebimento real antes do SPX guardar referências nativas de `fetch`/XHR; módulo principal continua em `document_idle`.
- v1.3.44: adiciona diagnóstico ponta a ponta da captura do Dashboard e fallback para extrair BR do body do POST quando a resposta de sucesso não trouxer `order_list`.
- v1.3.45: troca o `dashboard_upsert` central para JSONP com confirmação legível do Apps Script; remove a sincronização automática gigante via `dashboard_merge` e recupera apenas registros pendentes do dia, um a um.
- v1.3.46: remove qualquer replay automático da fila local ao entrar na tela ou abrir o Dashboard e encerra imediatamente JSONP inválido, evitando o ícone da aba em carregamento contínuo.
- v1.3.47: endurece a arquitetura central após auditoria: POST com dados no body + read-back por occurrence_key, health/capabilities do deploy, falha central propagada para retry, leitura do Dashboard sem lock, lock curto no upsert, captura única pelo receive-hook, migração local única e recuperação manual apenas da outbox nova.
- v1.3.48: mantém intacta a captura/gravação central validada e simplifica a camada visual: o servidor classifica os registros de hoje, o HTML usa essa classificação pronta e o botão Dash força recarga da versão atual.
- v1.3.49: elimina `google.script.run` do carregamento de dados do Dashboard; o `doGet(view=dashboard)` já entrega o HTML com o estado inicial embutido e as atualizações usam `dashboard_data` por JSONP.

### Próximo teste recomendado
O próximo teste deve validar somente a entrada no Dashboard da v1.3.47, sem ainda alterar retenção mensal nem a regra de envio por dia:

1. atualizar o código do Apps Script com a versão 1.3.47 e **reimplantar a mesma implantação**, preservando a URL `/exec`;
2. desativar/ativar o módulo e confirmar v1.3.47;
3. recarregar a tela SPX e verificar que o ícone da aba não fica em loading contínuo;
4. abrir `D` antes do primeiro recebimento e confirmar que aparece `central_health_ok` com build 1.3.47; se aparecer `central_health_error`, o deploy ativo está antigo/incompatível e não adianta testar recebimento ainda;
5. fazer um único recebimento real;
6. confirmar no diagnóstico, em ordem aproximada: `bridge_event` -> `receive_response_seen` -> `receive_success_recognized` -> `receive_queued` -> `process_occurrence_ready` -> `local_saved` -> `central_send_start` -> `central_send_confirmed`;
7. confirmar o BR no Dashboard com `received_at` do SPX, Login SPX, motivo, motorista/3PL e Bairro;
8. fazer mais alguns recebimentos rápidos e, se possível, com outro login/perfil, verificando que todos entram no mesmo Dashboard em ordem de horário;
9. somente depois validar o botão de envio para `Dados`.

Não marcar v1.3.47 como estável até esse teste real.

### Disciplina de continuidade
Em uma conversa nova, não pedir ao usuário para reexplicar tudo acima. Leia este arquivo e continue do estado atual. Se algo parecer contraditório em seções antigas, procure primeiro a versão mais recente documentada e o código atual antes de propor mudanças.

## Objetivo
Extensão Chrome modular usada no fluxo de recebimento/devoluções da SPX. O módulo principal exibe o histórico de tentativas de entrega de um BR, traduz os motivos, mostra motorista/ID/data/hora/foto e gera uma recomendação operacional. Também possui tratamento especial para "Endereço não encontrado".

## Estrutura principal
- `catalog.json`: catálogo/versionamento dos módulos.
- `extension/`: loader Chrome (Manifest V3).
- `modules/assistente-de-devolucoes/assistente.js`: módulo principal.
- `launcher/`: launcher do projeto.
- O módulo roda em `https://spx.shopee.com.br/*`.
- Rotas relevantes:
  - `#/generalReceiveTaskMgt/singleReceiveNew/`
  - `#/generalReceiveTaskOps/singleReceiveNew/`

## Fonte de histórico
Endpoint principal de histórico do BR:
`/api/fleet_order/order/detail/recipient_info?shipment_id=<BR>&station_type=3`

Os registros utilizados vêm de `data.recipient.On_Hold`.

## Tradução e apresentação
Exemplos importantes:
- Cannot find address → Endereço não encontrado
- Recipient unavailable for parcel → Ausente
- Recipient change location → Mudança de endereço
- Reject - Buyers change their mind → Rejeitado pelo comprador
- Office closed → Comércio fechado

A caixa "Rastreio do pedido" mostra a versão ao lado do título. Motorista e ID aparecem em linhas separadas. A caixa é movível e continua rolável mesmo quando o modal SPX está aberto.

## Cores dos motivos
- Motivos considerados válidos para contagem operacional: azul.
- "Mudança de endereço" e "Rejeitado pelo comprador": vermelho.
- Demais motivos: verde.
A cor é aplicada apenas ao selo arredondado do motivo.

## Regras de recomendação
Motivos válidos:
- endereço não encontrado
- palavra-chave incorreta ou não informada
- comércio fechado
- recusado por terceiros
- ausente

Motivos finais:
- não entregar
- mudança de endereço
- rejeitado pelo comprador

Regras principais:
- Última ocorrência "Fora de rota" → REALOCAR / FLEET.
- Qualquer motivo final, ou 3 dias distintos com motivos válidos → RETORNAR AO SOC.
- Endereço pendente → TRATATIVA DE ENDEREÇO.
- Caso contrário → PROCESSAR PARA ENTREGA.

IMPORTANTE: a regra é 3 DIAS DISTINTOS com motivos válidos, não simplesmente 3 ocorrências.

## Endereço não encontrado — cancelamento automático
Quando a ocorrência mais recente é "Endereço não encontrado" e existem os botões de tratativa, o módulo observa o modal SPX "Interceptado no Meio do Caminho". Quando o modal aparece, o cancelamento é disparado automaticamente por:
`POST /api/in-station/admin/common_site/eha/cancel_eo_reason`

Parâmetros principais:
- `reason_id = ER40`
- `reason_desc = Onhold with Delivery Address Issue`

Depois do cancelamento concluído:
- o estado visual passa para "Cancelado";
- o selo "Cancelado" permanece visível mesmo após releitura do BR dentro da janela de sessão prevista;
- o foco retorna para permitir continuar a bipagem sem precisar clicar manualmente no campo.

## Integração com Google Sheets
A partir da versão 1.3.7/1.3.8, após um cancelamento concluído de "Endereço não encontrado", o módulo envia o BR para um Google Apps Script ligado à planilha operacional.

Regra obrigatória:
- Apenas bipar o BR NÃO envia nada.
- O envio ocorre somente depois de um cancelamento concluído.
- O mesmo BR PODE ser registrado várias vezes no mesmo dia se houver novos cancelamentos reais (ex.: manhã e tarde).
- Não existe trava de duplicidade no módulo.
- Se o BR for bipado novamente sem existir novo cancelamento, não deve gerar novo registro.

Na planilha, o Apps Script:
- escolhe a aba do mês corrente;
- encontra a coluna da data em formato dd/MM na linha 1;
- considera que os BRs começam na linha 3;
- grava sempre abaixo do último BR preenchido naquela coluna;
- não altera fórmulas, cores, validações nem formatação condicional.

## Versionamento recente
- 1.2.9: melhoria de rolagem/z-index com modal SPX aberto.
- 1.3.2: correção da exibição da versão ao lado do título.
- 1.3.3: cores dos motivos.
- 1.3.4: cancelamento automático de "Endereço não encontrado".
- 1.3.5: tentativa inicial de persistência do "Cancelado".
- 1.3.6: persistência corrigida usando sessionStorage.
- 1.3.7: integração inicial com a planilha.
- 1.3.8: removida a trava que impedia registrar o mesmo BR novamente; cada novo cancelamento concluído pode gerar novo registro.

## Cuidados para futuras alterações
- Não alterar o comportamento do SPX OnHold; é outro projeto/repositório.
- Não modificar regras de recomendação sem confirmação explícita.
- Não transformar 3 dias distintos em 3 ocorrências.
- Não enviar BR para planilha apenas por bipagem/leitura.
- Não bloquear repetição do mesmo BR quando houver novo cancelamento real.
- Manter o fluxo de bipagem rápido, sem exigir clique no campo após cancelamento.
- Antes de editar, conferir a versão atual de `assistente.js` e `catalog.json` e manter os dois sincronizados.
- Este arquivo é documentação apenas e não participa da execução da extensão.

## Atualização 1.3.9 — abertura automática da caixa
Ao entrar em uma das rotas de recebimento `generalReceiveTaskMgt/singleReceiveNew` ou `generalReceiveTaskOps/singleReceiveNew`, após validação de acesso, a caixa 'Rastreio do pedido' aparece imediatamente com 'Aguardando leitura do BR...', mesmo antes da primeira bipagem. Aceita as rotas com ou sem barra final. Ao bipar, o comportamento existente de consulta permanece. A regra de cancelamento e o envio à planilha não foram alterados. Sintaxe verificada antes de publicar; confirmação em ambiente real pendente.


## Atualização 1.3.10 — ocorrência atual em BRs de retorno
Corrigido o caso em que BRs já em fluxo de retorno continuavam usando uma ocorrência antiga do histórico On_Hold como motivo vigente, especialmente motivos finais em vermelho como "Mudança de endereço" e "Rejeitado pelo comprador".

Agora o módulo também consulta o tracking atual. Se existir um evento mais recente "Retorno_LMHub_Em_Espera" / "Return_LMHub_Onhold", ele é acrescentado como ocorrência "ATUAL DO RETORNO" e passa a ser a referência para a recomendação. O histórico antigo continua visível, mas deixa de determinar a decisão quando pertence a um ciclo anterior.

Exemplo validado pela regra esperada: ocorrência antiga "Rejeitado pelo comprador" em 28/09 + evento atual de retorno em 07/10 07:48 com motivo "Fora de Rota" => o motivo vigente deve ser "Fora de Rota" e a recomendação deve ser "REALOCAR / FLEET".

A versão 1.3.9 (abertura automática ao entrar no recebimento) foi preservada. Sintaxe do JavaScript validada antes da publicação. Teste real no SPX ainda pendente.


## Atualização 1.3.11 — leitura ampla do retorno atual
A correção 1.3.10 não localizou o evento real em alguns BRs porque a SPX pode entregar "Retorno_LMHub_Em_Espera" fora de `data.tracking_list` ou com campos de horário diferentes.

Na 1.3.11, a busca percorre recursivamente todos os objetos da resposta de `tracking_info` e reconhece:
- `Retorno_LMHub_Em_Espera`
- `Return_LMHub_Onhold` / `Return_LMHub_On_Hold`

Também aceita timestamp em `timestamp`, `ctime`, `event_time`, `create_time`, `created_at`, `created_time`, `event_timestamp`, `update_time`, `time`, `date` e `datetime`, inclusive datas em texto.

O motivo atual é extraído de mensagens como `Devolução em espera: [Fora de Rota]`. Foi feito teste local com estrutura equivalente à imagem enviada: evento 07/10/2026 07:48, motivo "Fora de Rota", operador ROQUE DA CRUZ FERREIRA FILHO, com extração correta.

O histórico antigo permanece visível, mas a ocorrência de retorno mais recente deve ser adicionada como "ATUAL DO RETORNO" e controlar a recomendação. Abertura automática da 1.3.9 permanece preservada.


## Atualização 1.3.12 — corte do histórico pelo último Delivering
Após teste real, 1.3.10 e 1.3.11 ainda deixavam visíveis ocorrências antigas de ciclos anteriores, inclusive anteriores à entrada do pacote no ciclo atual do hub.

Na 1.3.12, o SPX-DV passa a usar a mesma estratégia validada no projeto SPX OnHold:
- varre recursivamente o `tracking_info` do próprio BR;
- identifica eventos `Delivering` pelo nome textual ou pelo código interno `2` em campos de status/state;
- seleciona o Delivering mais recente;
- usa a data/hora desse evento como início do ciclo atual;
- filtra `data.recipient.On_Hold` para mostrar e considerar apenas ocorrências com `ctime` igual ou posterior a esse corte.

Assim, ocorrências anteriores à última saída em rota deixam de aparecer e deixam de influenciar a recomendação. Se nenhum Delivering for localizado, o módulo preserva o comportamento anterior como fallback.

A lógica existente de cancelamento de endereço, Google Sheets, AutoAdd, cores e regra dos 3 dias distintos não foi alterada. Sintaxe validada e teste local de corte entre ciclo antigo e ciclo atual passou; validação no SPX real ainda pendente.


## Regra de trabalho do projeto — preservar o planejamento original
O desenvolvimento do SPX-DV deve ser incremental. Alterações futuras devem preservar o comportamento, as regras e o fluxo já planejados/validados, adicionando apenas novas necessidades sem reinterpretar silenciosamente a lógica existente.

Antes de qualquer mudança que possa alterar uma regra operacional já definida:
- comparar a proposta com o planejamento atual deste documento;
- sinalizar explicitamente qualquer divergência antes de editar o código;
- apontar riscos de cortar dados válidos, mudar recomendação, alterar fluxo ou criar efeitos colaterais;
- preferir extensões/aditivos à lógica existente em vez de substituições;
- quando houver incerteza sobre o significado de um evento/campo da SPX, primeiro diagnosticar/varrer a fonte real e só depois implementar a regra;
- não considerar uma versão “estável” até haver validação real no SPX.

Correção de entendimento sobre 1.3.12:
- usar o último `Delivering` como início do ciclo NÃO equivale necessariamente a identificar a entrada do pacote no nosso hub;
- portanto, a 1.3.12 não deve ser usada como base conceitual para filtrar ocorrências até que o evento exato de entrada/retorno no hub seja identificado;
- o objetivo original permanece: ocultar apenas ocorrências anteriores à entrada do BR no nosso hub e manter todas as ocorrências válidas do ciclo atual dentro do hub.


## Estados equivalentes — fluxo normal x fluxo de retorno
Regra confirmada pela operação:
- Fluxo normal do BR:
  - `LMHub_Onhold` = OnHold normal no hub.
  - `Delivering` = saiu para entrega.
- Fluxo de retorno:
  - `Return_LMHub_Onhold` = OnHold do BR já no fluxo de retorno.
  - `Return_LMHub_Returning` = equivalente ao `Delivering` dentro do fluxo de retorno; indica que o BR saiu na rota de retorno.

Esses estados NÃO devem ser misturados entre os fluxos.
Para BR de retorno, a fronteira entre histórico antigo e ciclo atual é a entrada em `Return_LMHub_Onhold`. Ocorrências anteriores a essa entrada pertencem ao ciclo normal anterior e não devem aparecer nem influenciar a análise atual do retorno.
Após essa fronteira, movimentações `Return_LMHub_Onhold` / `Return_LMHub_Returning` pertencem ao ciclo atual de retorno.
Não usar `Delivering` normal como marcador de ciclo em BR de retorno.


## Atualização 1.3.13 — separação correta entre BR normal e BR de retorno
A 1.3.12 foi substituída porque usava o último `Delivering` como corte, o que poderia apagar ocorrências válidas do mesmo ciclo.

Regra implementada na 1.3.13:
- BR normal:
  - `LMHub_Onhold` / `Delivering`;
  - não recebe corte de histórico por status de retorno;
  - mantém a regra original do módulo.
- BR de retorno:
  - a PRIMEIRA entrada em `Return_LMHub_Onhold` marca a passagem do fluxo normal para o fluxo de retorno;
  - ocorrências anteriores a essa entrada ficam fora da análise atual;
  - depois desse ponto, `Return_LMHub_Returning` e novas entradas em `Return_LMHub_Onhold` continuam no MESMO ciclo de retorno;
  - portanto, novas entradas em `Return_LMHub_Onhold` NÃO reiniciam o corte.
- A recomendação deixou de fazer um segundo corte por `current_return`; ela trabalha com toda a lista já filtrada do ciclo correto, preservando inclusive a contagem de 3 dias distintos dentro do retorno atual.
- A lógica de endereço usa a última ocorrência real de OnHold do ciclo atual, e não o marcador sintético de retorno.

Validação local:
- cenário normal sem `Return_LMHub_Onhold`: nenhuma ocorrência é cortada;
- cenário de retorno com `Return_LMHub_Onhold` em t=300, `Return_LMHub_Returning` em t=400 e novo `Return_LMHub_Onhold` em t=500: o corte permanece em t=300 e ocorrências t=350, 450 e 550 são preservadas.
- Sintaxe JavaScript validada.
- Validação real no SPX ainda pendente.


## Atualização 1.3.14 — leitura do status real visto no SPX
A validação real da 1.3.13 falhou no BR BR260544875792V: o painel ainda exibiu ocorrências antigas de 28/09 e 30/09, enquanto o histórico real do pedido mostrava uma ocorrência de retorno em 10/10/2026 10:28:09.

No histórico visual do SPX, o estado apareceu como:
- `Retorno_LMHub_Em_Espera`
- mensagem: `Devolução em espera: [Comércio Fechado]`

Também foram vistos estados do fluxo de retorno como:
- `Retorno_LMHub_Retornando`
- `Retorno_LMHub_Atribuindo`
- `Retorno_Atribuido_LMHub`
- `Retorno_Recebido_LMHub`

Conclusão: no ambiente real, o equivalente operacional de `Return_LMHub_Onhold` aparece como `Retorno_LMHub_Em_Espera`, e o equivalente de `Return_LMHub_Returning` aparece como `Retorno_LMHub_Retornando`.

A 1.3.14 passa a:
- reconhecer `Retorno_LMHub_Em_Espera`, `Return_LMHub_Onhold` e `Return_LMHub_On_Hold` como o mesmo tipo de ocorrência de retorno;
- varrer recursivamente todos os objetos do `tracking_info`, sem depender de um único campo fixo;
- localizar horário também por nomes alternativos de campos de tempo;
- extrair o motivo diretamente da mensagem real, por exemplo `Devolução em espera: [Comércio Fechado]`;
- usar a primeira ocorrência desse tipo como fronteira entre o histórico normal antigo e o ciclo de retorno atual;
- preservar todas as ocorrências de retorno posteriores dentro do mesmo ciclo;
- mostrar a mais recente como `ATUAL DO RETORNO` e as anteriores do mesmo ciclo como `OCORRÊNCIA DO RETORNO`;
- deixar de exibir/considerar ocorrências normais anteriores à entrada no retorno.

Teste local com o padrão exato observado na tela passou: `Retorno_LMHub_Em_Espera` -> `Comércio Fechado`.
Sintaxe validada. Validação real da 1.3.14 ainda pendente.


## Atualização 1.3.15 — diagnóstico da fonte real do histórico Return
A 1.3.14 continuou exibindo o histórico antigo no teste real, embora a tela de detalhes do pedido mostrasse claramente `Retorno_LMHub_Em_Espera` com a mensagem `Devolução em espera: [Comércio Fechado]`.

Decisão: não alterar novamente a regra funcional sem antes identificar a fonte real da informação.

A 1.3.15 é uma versão de diagnóstico:
- não muda as regras de recomendação;
- não muda o filtro funcional da 1.3.14;
- instala captura passiva de respostas `fetch` e `XMLHttpRequest` em páginas do domínio SPX;
- funciona também fora da tela de recebimento, inclusive na página individual de detalhes do pedido;
- procura respostas relacionadas ao BR ou que contenham sinais de retorno, como:
  - `Retorno_LMHub_Em_Espera`
  - `Return_LMHub_Onhold`
  - `Retorno_LMHub_Retornando`
  - `Return_LMHub_Returning`
  - `Devolução em espera`
  - `Comércio Fechado`
- registra endpoint, tamanho da resposta, BR da página, sinais encontrados e campos relevantes da resposta;
- armazena o diagnóstico em `localStorage`, permitindo capturar na aba de detalhes e consultar na aba de recebimento;
- adiciona botão `i` no cabeçalho da caixa do SPX-DV para abrir o diagnóstico.

Objetivo da validação:
1. atualizar para 1.3.15 e recarregar o SPX;
2. abrir o detalhe de um BR Return em que a timeline mostre `Retorno_LMHub_Em_Espera`;
3. aguardar o histórico carregar;
4. voltar à tela de recebimento e bipar o mesmo BR;
5. abrir o botão `i`;
6. usar o endpoint e os campos capturados para implementar a leitura definitiva, sem novas suposições.

Sintaxe JavaScript validada. Validação real pendente.


## Atualização 1.3.16 — mapeamento real dos status Return no tracking_info
O diagnóstico 1.3.15 identificou a fonte correta no ambiente real:
`/api/fleet_order/order/detail/tracking_info?shipment_id=<BR>`

No BR BR264020490470K, a resposta real trouxe:
- `status: 128`
- `message: "Devolução em espera: [Comércio Fechado]"`
- `on_hold_reason: "Comércio Fechado"`
- `operator: ...`
- `timestamp: ...`

Também apareceu um evento subsequente com:
- `status: 124`
- mensagem `Pedido em devolução ao vendedor`

Mapeamento operacional confirmado pelo diagnóstico:
- `128 = Retorno_LMHub_Em_Espera / Return_LMHub_Onhold`
- `124 = Retorno_LMHub_Returning / Retorno_LMHub_Retornando`

A 1.3.16 deixa de depender do texto `Retorno_LMHub_Em_Espera` para reconhecer a ocorrência do retorno e passa a reconhecer diretamente `status 128` no objeto real do tracking_info. O motivo é lido prioritariamente de `on_hold_reason`, com fallback para a mensagem `Devolução em espera: [motivo]`.

A regra de ciclo permanece:
- a primeira ocorrência status 128 inicia o ciclo Return;
- tudo anterior é histórico normal antigo e deve ficar fora da caixa/análise atual;
- status 124 não reinicia o ciclo;
- um novo status 128 posterior continua no mesmo ciclo e representa nova ocorrência do retorno.

Sintaxe validada e teste local reproduzindo o objeto real do diagnóstico passou. Validação real da 1.3.16 ainda pendente.


## Atualização 1.3.17 — remove falso positivo de status numérico e isola diagnóstico por BR
O teste real da 1.3.16 mostrou duas falhas importantes:
1. `status 128` não é identificador exclusivo de `Retorno_LMHub_Em_Espera`. No BR BR264020490470K, um objeto com status 128 representava a mensagem `Não havia pacotes para coletar`, gerando uma ocorrência falsa na caixa.
2. O diagnóstico estava exibindo uma requisição de outro BR anterior (BR260544875792V), porque os registros de localStorage não estavam sendo filtrados de forma estrita pelo BR atual.

Correção da 1.3.17:
- remove a regra `status 128 => Return_LMHub_Onhold`;
- um objeto só é tratado como ocorrência Return quando:
  - contém o nome textual `Return_LMHub_Onhold` / `Retorno_LMHub_Em_Espera`, ou
  - a mensagem contém explicitamente `Devolução em espera: ...`, ou
  - há `on_hold_reason` junto com linguagem explícita de devolução/retorno no mesmo objeto;
- `Não havia pacotes para coletar` não é mais reconhecido como Return OnHold;
- o diagnóstico passa a extrair o BR diretamente do parâmetro `shipment_id` da requisição e exibir somente registros compatíveis com o BR atual da caixa.

Validação local:
- falso positivo `status 128 + Não havia pacotes para coletar` => rejeitado;
- evento real `Devolução em espera: [Comércio Fechado]` => reconhecido;
- sintaxe JavaScript validada.

Observação importante:
Os códigos numéricos 128/124 observados anteriormente não devem ser tratados como mapeamento global confiável. A classificação funcional deve se basear na semântica real do evento/resposta.


## Validação real da 1.3.17
Teste real em 13/10/2026 confirmou que a separação do ciclo Return passou a funcionar:
- ocorrências antigas anteriores ao fluxo de retorno deixaram de aparecer;
- o motivo atual `Comércio Fechado` foi lido corretamente do tracking do retorno;
- o painel passou a mostrar apenas ocorrências do ciclo Return atual;
- a recomendação resultou em `PROCESSAR PARA ENTREGA`, coerente com apenas um dia válido de tentativa no ciclo atual.

Observação para próxima revisão:
- no BR testado apareceram duas entradas `Comércio Fechado` no mesmo dia (10/10/2026 11:32:25 e 11:33:06), com o mesmo operador;
- validação do usuário: são duas ocorrências operacionais reais, portanto ambas devem permanecer visíveis;
- não aplicar deduplicação automática entre ocorrências do mesmo motivo/dia apenas por proximidade de horário.


## Atualização 1.3.18 — abrir automaticamente ao entrar em Recebimento unitário
Problema observado em vídeo real: ao navegar pelo menu `Entrada → Recebimento` e clicar em `Recebimento unitário`, o SPX entrava em `#/generalReceiveTaskOps/singleReceiveNew/<RT>`, mas a caixa do SPX-DV não reaparecia automaticamente.

A 1.3.18 torna a detecção de rota mais robusta:
- mantém suporte a `hashchange`;
- adiciona `popstate`;
- adiciona observação da URL a cada 250 ms para cobrir navegação SPA/pushState do próprio SPX;
- ao entrar em qualquer rota `singleReceiveNew`, força `collapsed = false`;
- recria a caixa imediatamente com `Aguardando leitura do BR...`;
- ao sair e entrar novamente em Recebimento unitário, a caixa deve abrir novamente;
- uma autorização já validada dentro da mesma sessão SPA é reaproveitada; em recarga completa a validação é refeita;
- evita instalar múltiplos listeners de Enter ao alternar entre telas.

Não houve alteração nas ocorrências, fluxo Return, recomendação, AutoAdd, cancelamento de endereço ou integração com planilha.

Sintaxe JavaScript validada. Validação real no SPX ainda pendente.


## Validação real da 1.3.18
Teste real confirmado pelo usuário em 15/10/2026:
- ao navegar por `Entrada → Recebimento → Recebimento unitário`, a caixa do SPX-DV voltou a abrir automaticamente;
- a abertura ocorre antes da primeira bipagem, com o estado de espera;
- o ajuste de navegação SPA funcionou no ambiente real.

A 1.3.18 passa a ser a referência validada também para o comportamento de abertura automática no recebimento unitário.


## Atualização 1.3.19 — transportadora por ocorrência
Necessidade confirmada pelo usuário: cada ocorrência deve mostrar a transportadora do motorista correspondente à AT daquela tentativa, e não uma transportadora geral do BR.

Fonte real confirmada em 21/10/2026:
- `tracking_info?shipment_id=<BR>` traz a sequência operacional do BR;
- antes de cada saída em rota (`status: 2` / Delivering), o histórico traz eventos como `Pedido adicionado à Assignment Task [AT...]`;
- a tela `#/delivery-assignment/list` consulta:
  `POST /spx_delivery/admin/assignment/assignment_task/search/v2`;
- payload confirmado:
  `{ assignment_task_id, pageno: 1, count: 20, search_type: 0 }`;
- a resposta traz diretamente:
  - `assignment_task_id`;
  - `driver_id`;
  - `driver_name`;
  - `agency` (Agência 3PL / transportadora);
  - `agency_id`.

Implementação:
- percorre cronologicamente o `tracking_info`;
- mantém a AT mais recente observada antes de cada Delivering;
- liga cada ocorrência normal de OnHold à saída em rota anterior;
- prioriza correspondência pelo ID do motorista da ocorrência;
- consulta o `search/v2` apenas para as ATs únicas encontradas;
- usa cache em memória para não repetir a mesma consulta de AT;
- antes de exibir a Agência 3PL, valida o ID do motorista retornado pela AT quando ambos os IDs estão disponíveis;
- mostra em cada card normal:
  - Motorista;
  - ID;
  - Transportadora.
- se a AT foi localizada mas a Agência 3PL não puder ser obtida, mostra `Transportadora: Não localizada`.
- ocorrências sintéticas do fluxo Return continuam exibindo `Operador` e não recebem uma transportadora inventada.

Teste local:
- cenário baseado no BR real com três ciclos:
  - AT20261016BAEPX → motorista 2308746;
  - AT20261018BEGXJ → motorista 174601;
  - AT20261020BHHQR → motorista 2169742;
- cada ocorrência foi associada à AT correta.
- sintaxe JavaScript validada.

A lógica de recomendação, regra dos 3 dias, Return, cancelamento de endereço, planilha, AutoAdd e abertura automática da 1.3.18 não foi alterada.
Validação real no SPX da transportadora por ocorrência ainda pendente.


## Atualização 1.3.20 — 3PL ao lado do motorista
A lógica da v1.3.19 foi preservada integralmente. Foi alterada apenas a apresentação visual:
- removido o texto `Transportadora:`;
- o valor de `agency` passa a aparecer na mesma linha do motorista;
- o ID continua na linha seguinte;
- quando a agência não é localizada, nenhum texto extra é mostrado.

Exemplo:
`Motorista: TIAGO PIRES TRINDADE — SPXOWNFLEET`
`ID: 2169742`

Nenhuma alteração na associação ocorrência → AT → Agência (3PL), Return, recomendação, AutoAdd, endereço, planilha ou abertura automática.
Sintaxe JavaScript validada. Validação visual real no SPX pendente.


## Preparação da automação da aba Dados
Em 21/10/2026 o usuário liberou o início da automação da planilha:
https://docs.google.com/spreadsheets/d/14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY/edit
Aba alvo: `Dados`.

Regras confirmadas:
- enviar somente a ocorrência atual que está sendo recebida naquele momento;
- não reenviar o histórico inteiro do BR;
- se o mesmo BR for bipado novamente sem uma nova ocorrência pendente, não criar nova linha;
- colunas preenchidas pela automação:
  - C Pedido;
  - D Motivo do APP;
  - E Driver ID;
  - F Motorista;
  - G Transportadora 3PL;
  - I BAIRRO;
  - J Data da ocorrência;
- A, B e H não são preenchidas pela automação;
- C é a referência de ocupação: se C tiver valor, pular para a próxima linha;
- fórmulas existentes nas células de destino podem ser sobrescritas por dados reais;
- entradas manuais devem ser preservadas;
- linha verde representa fim de um recebimento/lote, nunca recebe BR; o lote seguinte começa abaixo dela;
- bairro:
  - fluxo LMHub normal → `buyer_addr_district` (Bairro do Comprador);
  - fluxo Return_LMHub → `seller_addr_district` (Bairro do Vendedor);
- endpoint confirmado para revelar bairro sensível:
  `GET /api/fleet_order/order/detail/show_sensitive_data?shipment_id=<BR>&data_field=<campo>`;
- resposta: `data.data_detail`.

Foi criado `apps-script/recebimento-onhold-dados.gs` com o Web App receptor da planilha.
Ele já implementa:
- gravação somente em C,D,E,F,G,I,J;
- preservação de A,B,H;
- coluna C como ocupação;
- reconhecimento de linha verde;
- proteção contra concorrência;
- deduplicação exata por BR + timestamp da ocorrência usando nota em C;
- preservação de entradas manuais;
- preenchimento apenas de campos conhecidos.

O módulo principal permanece em v1.3.20 até o Web App ser implantado e sua URL ser adicionada. Isso evita publicar uma integração incompleta.
Próximo passo obrigatório: implantar o Apps Script como Web App e obter a URL `.../exec`. Depois ligar o SPX-DV ao endpoint e publicar a próxima versão para teste real.


## Atualização 1.3.21 — envio automático para aba Dados
Web App implantado pelo usuário:
`https://script.google.com/a/macros/shopee.com/s/AKfycbzVqz60x9ZBTt2dL83cxXaaHRMlqhEpU1r7AVlczQFmQSUdNGkyPUQcRsXzY17ImcbNOQ/exec`

A extensão passou a enviar automaticamente somente a ocorrência atual recebida para a aba `Dados`.

Payload enviado:
- `shipment_id`
- `reason`
- `driver_id`
- `driver_name`
- `agency`
- `neighborhood`
- `occurrence_timestamp`
- `flow`

Bairro:
- LMHub normal → `buyer_addr_district`;
- Return_LMHub → `seller_addr_district`;
- fonte: `/api/fleet_order/order/detail/show_sensitive_data`;
- valor: `data.data_detail`.

Proteção contra histórico antigo:
- a última ocorrência visível é candidata;
- se não existe estado posterior ao OnHold, ela continua pendente e pode ser enviada;
- se o próprio bip do Recebimento já gerou o próximo estado, a ocorrência ainda é aceita quando essa mudança aconteceu até 5 minutos do scan;
- se existe mudança posterior antiga, o BR é tratado como não pendente e não é enviado;
- o Web App também deduplica por BR + timestamp da ocorrência.

Teste local com o tracking real do BR de três ocorrências:
- última ocorrência: Palavra-chave em 1792503229;
- próximo estado real: LMHub em 1792612152;
- scan 2s após esse estado → elegível, representando o recebimento naquele momento;
- scan 15min depois → não elegível;
- cenário ainda pendente sem estado posterior → elegível.

A v1.3.21 preserva painel, Return, recomendação, regra dos 3 dias, endereço, planilha antiga de cancelamento, AutoAdd e navegação da v1.3.20.
Validação real da nova gravação na aba Dados ainda pendente.


## Atualização 1.3.22 — correção de BRs válidos não enviados
Em 22/10/2026 o usuário reportou que vários BRs bipados no Recebimento unitário, com ocorrência válida visível no painel, não estavam chegando à aba `Dados`.

Caso observado:
- BR `BR268328614230Y`;
- ocorrência visível: `Endereço não encontrado`;
- data/hora: 22/10/2026 08:28:43;
- motorista: EDUARDO EDSON FLORES;
- ID: 1732584;
- 3PL: SPXOWNFLEET;
- BR não encontrado na faixa atual da aba Dados após o bip.

Causa identificada na v1.3.21:
- `occurrenceIsReceivableNow()` tratava QUALQUER evento posterior no `tracking_info` como encerramento da ocorrência;
- o tracking contém eventos informativos que não mudam o estado operacional (AT, auditoria, endereço etc.);
- isso gerava falsos negativos e bloqueava envios válidos.

Correção v1.3.22:
- adicionada `nodeEndsPendingOnhold()`;
- somente mudanças reais de ciclo encerram a pendência:
  - nova saída em rota / Delivering;
  - Delivered;
  - Return_LMHub_Returning / equivalente semântico;
  - recebimento/entrada operacional em LMHub;
- eventos meramente informativos deixam de bloquear;
- continua válida a janela de até 5 minutos quando a própria leitura no Recebimento acabou de gerar a mudança de estado.

A planilha foi inspecionada diretamente:
- o BR do caso não estava presente em `Dados!C258800:C258932`;
- as linhas disponíveis possuem fórmulas em D,E,F,G,I,J;
- isso não impede a automação, pois a regra de ocupação continua sendo o valor visível da coluna C.

Sintaxe JavaScript validada. Validação real da v1.3.22 pendente.


## Atualização 1.3.23 — todo BR recebido com ocorrência vai para Dados
Regra operacional simplificada após validação com o usuário:
- se o BR foi bipado no Recebimento unitário e o SPX-DV encontrou ocorrência no ciclo atual, enviar para a aba Dados;
- enviar somente a ocorrência mais recente do ciclo atual;
- não tentar mais inferir se a ocorrência continua pendente a partir de eventos posteriores do tracking_info;
- essa inferência da 1.3.21/1.3.22 gerava falsos negativos e deixava BRs válidos fora da planilha;
- a mesma ocorrência continua protegida contra duplicação pelo Web App usando BR + timestamp;
- uma ocorrência nova do mesmo BR terá timestamp diferente e poderá gerar nova linha.

Bairro e demais campos permanecem iguais:
- LMHub normal → buyer_addr_district;
- Return_LMHub → seller_addr_district;
- grava somente C,D,E,F,G,I,J;
- A,B,H permanecem intocadas;
- linha verde e coluna C continuam controlando a posição de gravação.


## Otimização do Web App — sem deduplicação e sem notas
Em 22/10/2026 o usuário decidiu remover a deduplicação do Web App da aba Dados.

Nova regra:
- cada recebimento enviado pelo SPX-DV gera uma nova linha;
- não pesquisar BR antigo na aba Dados;
- não gravar nota `SPX-DV:BR|timestamp` na coluna C;
- a extensão continua enviando somente a ocorrência mais recente do ciclo atual;
- a posição continua respeitando linha verde e coluna C.

Otimizações no arquivo `apps-script/recebimento-onhold-dados.gs`:
- removido `findExistingOccurrenceRow_`;
- removido `notePrefix`;
- removido `setNote`;
- removida busca com TextFinder sobre a coluna C;
- C:G agora são gravadas em um único `setValues`;
- I:J são gravadas em um único `setValues`;
- H continua intocada;
- busca pela próxima linha livre passou a ler A e C em blocos de 50 linhas, reduzindo chamadas ao Google Sheets;
- A, B e H continuam preservadas;
- sintaxe do Apps Script validada.

Observação operacional:
o Web App já implantado não é atualizado automaticamente quando o arquivo GitHub muda. É necessário copiar novamente o conteúdo atualizado para o projeto Apps Script e criar uma nova versão da mesma implantação para manter a URL `/exec`.


## Correção do Web App — duplicidade e linhas apagadas
Em 22/10/2026 o teste real mostrou dois efeitos da versão sem deduplicação:
1. rebipar o mesmo BR com a mesma ocorrência criava uma nova linha;
2. ao excluir linhas já usadas, o ponteiro persistido continuava adiante e deixava os espaços apagados sem reaproveitamento.

Correção aplicada em `apps-script/recebimento-onhold-dados.gs`:
- deduplicação voltou usando chave `BR + occurrence_timestamp`;
- não usa mais notas na coluna C;
- controle fica na aba técnica oculta `_SPX_DV_CONTROLE`;
- essa aba guarda chave da ocorrência, linha de Dados e data/hora de registro;
- a aba é criada automaticamente e ocultada;
- a busca por duplicidade ocorre somente nessa aba técnica, não nas 258 mil linhas de Dados;
- `findWritableRow_` volta a procurar desde o início do lote atual para reaproveitar linhas apagadas;
- nova linha verde encontrada atualiza o início do lote;
- A, B e H seguem intocadas;
- C:G e I:J continuam sendo gravadas em bloco;
- sintaxe validada.

Observação:
ocorrências gravadas durante a janela temporária sem deduplicação não possuem chave anterior na nova aba técnica. A proteção passa a ser confiável para registros feitos após a implantação desta correção.


## Atualização 1.3.24 — envio da planilha não é cancelado pelo próximo bip
Em 22/10/2026 o usuário reportou que alguns BRs recebidos com ocorrência não entravam na planilha na primeira leitura e só apareciam após bipar novamente.

Casos observados:
- BR final `89N`: recebido no SPX, não apareceu na planilha;
- BR final `98M`: não entrou na primeira leitura, entrou após novo recebimento/bip.

Causa confirmada no código da v1.3.23:
- `loadShipment()` usa `currentRequest` e `currentShipment` para cancelar o processamento do painel quando chega um novo BR;
- o envio à planilha acontecia dentro desse mesmo fluxo, somente depois de histórico, tracking, AT/3PL e bairro;
- se o operador bipasse o próximo BR antes de tudo terminar, o BR anterior era interrompido e nunca chegava ao Web App.

Correção v1.3.24:
- envio para a aba Dados foi separado do ciclo visual do painel;
- cada bip agenda `processDataSheetScan(shipmentId)`;
- essa tarefa não depende de `currentShipment` nem de `currentRequest`;
- um novo bip pode trocar o painel sem cancelar o envio do BR anterior;
- a tarefa independente busca histórico, tracking, AT/3PL, bairro e envia a ocorrência mais recente;
- `enrichAttemptsWithAssignmentAgency` aceita execução sem guarda de versão quando chamada pela fila independente;
- o envio antigo dentro de `loadShipment()` foi removido para evitar duas tentativas paralelas desnecessárias;
- Web App e sua URL não mudaram;
- deduplicação no Apps Script por BR + timestamp continua ativa.

Sintaxe JavaScript validada. Validação real pendente.


## Atualização 1.3.25 — trava local por BR + timestamp
Após validação com o usuário, a extensão passou a reaproveitar a ideia operacional do fluxo de cancelamento de endereço para evitar reenvio da mesma ocorrência.

Regra:
- chave local = `BR + occurrence_timestamp`;
- mesma ocorrência no mesmo BR → envia uma vez;
- rebip da mesma ocorrência → não envia de novo;
- mesmo BR com nova ocorrência, mesmo motivo ou motivo diferente, mas novo timestamp → envia normalmente.

Implementação:
- novo estado em `sessionStorage`: `spxdv:data-sheet-occurrences-v1`;
- retenção local de 24h apenas para evitar reenvios na sessão;
- novo `Set` em memória para ocorrências em voo, evitando dois POSTs simultâneos quando dois bips acontecem muito próximos;
- a ocorrência é marcada como enviada somente depois que o fetch ao Web App é aceito pelo navegador;
- em falha de fetch, a reserva em voo é liberada para permitir nova tentativa;
- o Apps Script continua como segunda proteção, deduplicando `BR + timestamp` entre sessões/recargas.

A fila independente da v1.3.24 permanece:
- um novo bip não cancela o envio do BR anterior.

Sintaxe JavaScript validada. Validação real pendente.


## Atualização 1.3.26 — planilha só dispara no Enter do SPX TN
Em 22/10/2026 o usuário identificou que apenas colar um BR no campo de Recebimento, sem confirmar o recebimento, já fazia o BR chegar à planilha.

Causa:
- `checkShipment()` era chamado pelo monitor a cada 300ms;
- qualquer mudança no valor do campo SPX TN podia chamar `queueDataSheetScan()`;
- portanto "campo mudou" estava sendo usado como se fosse "recebimento submetido".

Correção:
- `checkShipment(submitted = false)` agora separa atualização do painel e submissão;
- monitor, carregamento inicial e simples colagem chamam `checkShipment()` sem envio;
- somente Enter chama `checkShipment(true)`;
- o Enter só é aceito quando o próprio campo SPX TN está focado/alvo;
- colar/digitar BR sem Enter pode atualizar o painel, mas não envia à planilha;
- Enter em outro botão/modal não dispara envio;
- fila independente da v1.3.24 permanece;
- trava local BR + timestamp da v1.3.25 permanece;
- Apps Script não mudou.

Verificação:
- sintaxe JavaScript passou;
- busca no código confirmou que a única chamada de `queueDataSheetScan(value)` está dentro de `if (submitted)`;
- chamadas automáticas `checkShipment()` e `setInterval(checkShipment, 300)` continuam com submitted=false.

Validação real no SPX ainda pendente.


## Atualização 1.3.27 — confiabilidade do envio para a planilha
Em 26/10/2026 o usuário reportou que o painel mostrava praticamente todos os BRs com ocorrência, mas somente parte deles aparecia na planilha.

Diagnóstico confirmado:
1. o painel e a planilha usam fluxos diferentes;
2. o painel apenas lê e mostra os dados;
3. a planilha fazia uma segunda coleta independente após o Enter e dependia de histórico, tracking, AT/3PL, bairro e Web App;
4. essa segunda coleta era de tentativa única;
5. o POST ao Apps Script usa `no-cors`, então o navegador não consegue ler a resposta real do servidor;
6. a extensão marcava localmente a ocorrência como enviada mesmo sem confirmação legível do Apps Script;
7. a aba oculta `_SPX_DV_CONTROLE` mostrou ocorrências diferentes registradas na mesma `dados_row`, provando sobrescrita de linhas na aba Dados.

Exemplos reais vistos no controle oculto:
- mais de uma occurrence_key apontando para `252897`;
- mais de uma occurrence_key apontando para `252898`;
- mais de uma occurrence_key apontando para `252901`;
- mais de uma occurrence_key apontando para `252902`.

Correções:
### Extensão v1.3.27
- remove estado persistente de "já enviado" em sessionStorage;
- mantém apenas trava temporária em memória para dois envios simultâneos da mesma ocorrência;
- deduplicação definitiva permanece no Apps Script por BR + timestamp;
- `queueDataSheetScan` agora tenta novamente automaticamente em 1200ms, 2500ms e 5000ms quando a coleta não consegue concluir;
- próximo bip não cancela essas tentativas;
- envio continua restrito ao Enter no campo SPX TN.

### Apps Script
- `SpreadsheetApp.flush()` antes de escolher a linha;
- `SpreadsheetApp.flush()` imediatamente após gravar C:G e I:J;
- confirmação de que a coluna C realmente contém o BR esperado antes de registrar a occurrence_key;
- novo flush antes de liberar o lock;
- objetivo: impedir duas execuções sequenciais de enxergarem a mesma linha como vazia e uma sobrescrever a outra.

A atualização do arquivo Apps Script no GitHub exige nova implantação manual no projeto Google Apps Script para entrar em produção.


## Atualização 1.3.28 — início da fila e Dashboard de Recebimento
Em 27/10/2026 foi iniciada a nova arquitetura operacional inspirada no padrão visual de dashboard analisado, sem substituir ainda o envio automático da v1.3.27.

Alterações:
- adicionada a chave local `spxdv:dashboard-queue-v1`;
- a mesma ficha já preparada para a aba Dados passa a ser salva também na fila do Dashboard;
- chave da ficha continua sendo `BR + occurrence_timestamp`, permitindo nova ocorrência real do mesmo BR sem duplicar a mesma ocorrência;
- o armazenamento preserva registros não confirmados mesmo após a virada do dia; confirmados antigos poderão ser limpos automaticamente quando o fluxo de confirmação estiver ativo;
- botão `Dash` adicionado ao cabeçalho da caixa;
- o Dashboard abre em aba própria, com tema escuro e tabela na mesma ordem da planilha:
  - Pedido;
  - Motivo do APP;
  - Driver ID;
  - Motorista;
  - Transportadora 3PL;
  - BAIRRO;
  - Data da ocorrência;
  - Status;
- o Dashboard mostra capturados hoje, registros na fila, confirmados e pendentes antigos, além de pesquisa;
- o bairro passa a ser consultado também para exibição na caixa:
  - LMHub normal → `buyer_addr_district`;
  - Return_LMHub → `seller_addr_district`;
- removido o traço visual entre Motorista e 3PL. Exemplo atual:
  `Motorista: ALEX DOS SANTOS OLIVEIRA SPXOWNFLEET`;
- o envio automático existente para a aba Dados foi preservado nesta versão para permitir validar primeiro captura, bairro e Dashboard sem alterar de uma vez o fluxo crítico de produção.

Próxima etapa planejada após validação real:
- substituir o envio individual/automático pelo envio em lote iniciado pelo botão do Dashboard;
- obter confirmação real do Apps Script antes de marcar registros como confirmados;
- somente então remover registros confirmados na virada do dia.


## Atualização 1.3.29 — limpeza manual segura e tema preto/laranja
Em 27/10/2026, após validação real da v1.3.28 com captura rápida de BRs, bairro na caixa e registros aparecendo no Dashboard, foram feitos ajustes de operação e aparência sem alterar a lógica de captura.

Regras de retenção confirmadas:
- todos os registros do dia permanecem visíveis no Dashboard, inclusive depois de confirmados;
- na virada do dia, registros confirmados do dia anterior podem ser removidos automaticamente;
- registros ainda pendentes nunca são apagados apenas pela virada do dia;
- adicionado botão `Limpar confirmados` para limpeza manual;
- a limpeza manual remove somente registros confirmados do dia atual;
- registros capturados/pendentes não são apagados pelo botão;
- antes de limpar, o Dashboard pede confirmação e informa quantos registros serão removidos.

Layout:
- fundo geral alterado para preto;
- cards e painel principal passaram para tons quase pretos;
- cabeçalho principal recebeu borda e sombra laranja discreta;
- cabeçalho da área de recebimentos e cabeçalhos da tabela receberam realces/sombras laranja;
- botões receberam contorno laranja discreto;
- funcionalidade, ordem das colunas e dados da v1.3.28 foram preservados.

O envio automático legado continua preservado nesta etapa. O botão de envio em lote e a confirmação real do Apps Script continuam como próxima fase.


## Atualização 1.3.30 — login SPX por recebimento na fila geral da máquina
Em 27/10/2026 foi confirmada a regra operacional de que a Dashboard representa o recebimento geral do dia no mesmo computador/perfil do navegador, mesmo quando houver troca de conta SPX.

Implementação:
- a fila continua única por máquina/perfil; trocar de login SPX não cria outra fila;
- o login vigente no momento do Enter é consultado pela fonte já usada para validação:
  `/api/admin/basicserver/current_user/basic_info`;
- o e-mail retornado em `data.email` passa a ser salvo na ficha como `operator_login`;
- a consulta do login é refeita na submissão para que uma troca de conta no mesmo navegador seja refletida nos próximos recebimentos;
- falha temporária nessa consulta usa o último login conhecido da sessão como fallback;
- Dashboard ganhou coluna `Login SPX`;
- Dashboard ganhou card `Operadores hoje`;
- Dashboard ganhou filtro `Todos os operadores` / login específico;
- pesquisa textual também considera o login;
- registros criados antes da v1.3.30 permanecem preservados e aparecem como `Não identificado` por não possuírem o campo histórico.

A identificação do login é informativa e não separa a fila. Outro computador/perfil continua tendo armazenamento local independente.


## Atualização 1.3.31 — Dashboard persistente, horário de recebimento, Top 10 e pendentes clicáveis
Em 28/10/2026 o teste real mostrou que a fila baseada somente em `localStorage` podia aparecer separada após troca/abertura de login SPX. Para reduzir a dependência da sessão do portal, a fila principal do Dashboard foi movida para `IndexedDB`.

### Fila e migração
- banco local: `spxdv-dashboard-v1`;
- store: `records`;
- chave continua `BR + occurrence_timestamp`;
- o banco é independente de `localStorage.clear()` do portal;
- ao iniciar o módulo, registros antigos existentes em `spxdv:dashboard-queue-v1` são mesclados automaticamente;
- em re-bip da mesma ocorrência, são preservados o primeiro login e o primeiro horário de recebimento;
- fallback para localStorage permanece apenas se IndexedDB falhar;
- registros confirmados antigos podem ser limpos na virada do dia;
- pendentes continuam preservados.

Observação: IndexedDB é compartilhado entre logins SPX dentro do mesmo perfil/origem do Chrome. Perfis diferentes do Chrome ou janelas anônimas continuam tendo armazenamento separado.

### Data/hora do recebimento
- o horário é capturado exatamente no Enter do campo SPX TN;
- novo campo interno: `received_at`;
- nova coluna `Recebido em` aparece antes de `Pedido`;
- `Data da ocorrência` continua mostrando o timestamp real da ocorrência OnHold e não foi substituída.

### Top 10 motoristas ofensores
- novo painel `Top 10 motoristas ofensores do dia`;
- ranking pela quantidade de ocorrências recebidas no dia;
- mostra posição, nome, Driver ID e quantidade;
- registros sem motorista identificável não entram no ranking.

### Visualização de pendentes
- card `Na fila` é clicável e mostra somente registros do dia ainda não confirmados;
- card `Pendentes antigos` é clicável e mostra pendentes preservados de dias anteriores;
- card `Capturados hoje` retorna para a visão completa;
- aviso de pendentes antigos orienta clicar no card;
- filtros de operador e pesquisa continuam ativos em cada visão.

A lógica de captura de BR, bairro, motorista, 3PL, login SPX, Return, recomendação e envio automático legado não foi alterada.


## Atualização 1.3.32 — Dashboard central no Apps Script
Em 28/10/2026 ficou confirmado em teste real que localStorage e IndexedDB não garantem uma fila única quando operadores usam ambientes/perfis de navegador separados. A arquitetura do Dashboard foi então movida para armazenamento central no mesmo Web App do Apps Script usado pela aba Dados.

### Regra central
- a fila do Dashboard deixa de depender do armazenamento do login/perfil SPX;
- todos os módulos que usam a mesma URL do Web App passam a alimentar a mesma fila central;
- isso integra logins diferentes e também computadores diferentes que usem esta mesma implantação;
- a chave continua sendo `BR + occurrence_timestamp`;
- reenvio da mesma ocorrência atualiza a mesma ficha e não cria duplicidade;
- o primeiro `received_at` e o primeiro `operator_login` são preservados.

### Aba técnica central
Nova aba oculta:
`_SPX_DV_DASHBOARD`

Campos:
- occurrence_key
- received_day
- received_at
- shipment_id
- reason
- driver_id
- driver_name
- agency
- neighborhood
- occurrence_timestamp
- flow
- operator_login
- status
- updated_at

### Status / confirmação
- ao receber a ficha, ela entra como `captured` (pendente);
- o fluxo legado de gravação na aba Dados continua ativo;
- quando o próprio Apps Script confirma a gravação em Dados, a mesma occurrence_key é marcada como `confirmed`;
- se a ocorrência já existia em Dados por deduplicação, também é marcada como confirmada no Dashboard;
- se a gravação falhar, a ficha permanece pendente;
- desta forma, o Dashboard passa a ter confirmação real no servidor sem depender da resposta legível pelo navegador.

### Dashboard Web
O próprio Web App agora atende:
`?view=dashboard`

A página mostra:
- Recebido em (antes do BR);
- Pedido;
- Motivo do APP;
- Driver ID;
- Motorista;
- Transportadora 3PL;
- Bairro;
- Data da ocorrência;
- Login SPX;
- Status.

Também inclui:
- Capturados hoje;
- Na fila;
- Confirmados;
- Pendentes antigos;
- Operadores hoje;
- Top 10 motoristas ofensores do dia;
- filtro por operador;
- pesquisa;
- card Na fila clicável;
- card Pendentes antigos clicável;
- card Capturados hoje para voltar à visão geral;
- botão Limpar confirmados;
- atualização automática a cada 5 segundos.

### Migração
Ao iniciar a v1.3.32, os registros ainda presentes na fila local são enviados em lote para a fila central. Isso permite reunir dados que estavam separados entre ambientes antigos assim que cada ambiente for aberto com a nova versão.

### Implantação obrigatória
A alteração do arquivo `apps-script/recebimento-onhold-dados.gs` no GitHub NÃO atualiza a implantação já publicada. Antes de ativar a v1.3.32 em produção, é obrigatório:
1. copiar o código atualizado para o projeto Google Apps Script;
2. criar uma nova versão da mesma implantação Web App;
3. manter a mesma URL `/exec`;
4. somente depois desativar/ativar o módulo para carregar a v1.3.32.

A v1.3.32 ainda precisa de validação real no SPX e no Web App antes de ser considerada estável.


## Hotfix 1.3.32 — normalização de data no Dashboard central
Em 28/10/2026, após a primeira implantação real da fila central, a aba oculta `_SPX_DV_DASHBOARD` foi criada corretamente e passou a receber registros. A inspeção ao vivo confirmou 181 fichas gravadas, inclusive registros recentes e alguns já marcados como `confirmed`.

Falha identificada:
- a coluna `received_day` era gravada como texto `yyyy-MM-dd`;
- o Google Sheets convertia automaticamente esse valor para uma célula real do tipo DATE;
- `getValues()` devolvia um objeto `Date`;
- o código usava `clean_(value)`, gerando uma representação textual diferente de `yyyy-MM-dd`;
- com isso, o Dashboard não encontrava registros do dia atual e aparecia vazio, embora os BRs estivessem gravados.

Correção:
- adicionada `normalizeDashboardDay_()`;
- objetos `Date`, serial numérico e texto de data são normalizados para `yyyy-MM-dd` em `America/Sao_Paulo`;
- `dashboardRecordFromRow_`, limpeza automática de confirmados antigos e limpeza manual de confirmados passam a usar a normalização;
- nenhuma ficha existente é apagada ou regravada por este hotfix.

Este hotfix exige nova versão da mesma implantação do Apps Script. A URL `/exec` deve permanecer a mesma.


## Hotfix visual/operacional 1.3.32 — fluxo simples e pendência real
Em 28/10/2026 o Dashboard central foi validado com dados reais, mas a exibição de estados técnicos `captured` / `confirmed` deixou a operação confusa e visualmente instável.

Diagnóstico ao vivo:
- `_SPX_DV_DASHBOARD` continha 191 registros;
- 15 estavam como `confirmed`;
- 176 estavam como `captured`;
- 28 dos 176 `captured` já existiam em `_SPX_DV_CONTROLE`, portanto já haviam sido gravados em Dados e estavam apenas com o status central desatualizado.

Correções:
- `getDashboardData()` agora reconcilia automaticamente a fila central com `_SPX_DV_CONTROLE`;
- qualquer occurrence_key já registrada na planilha passa para `confirmed` no servidor;
- a visão principal não mostra mais coluna Status;
- removido o card Confirmados;
- `Capturados hoje` foi renomeado para `Recebidos hoje`;
- `Na fila` foi renomeado para `Pendências`;
- um registro novo só aparece como pendência operacional após 30 segundos sem confirmação, evitando o efeito visual `Pendente -> Confirmado` durante o processamento normal;
- `Pendentes antigos` continua preservado e clicável;
- botão `Limpar confirmados` foi renomeado para `Limpar já enviados`, mantendo a mesma proteção: só remove registros confirmados;
- o Top 10, data/hora de recebimento, login SPX, filtros e fila central permanecem inalterados.

Objetivo: o fluxo normal deve ser visualmente simples — BR entra e aparece na lista. Status técnico só interessa quando existe uma exceção real.


## Ajuste visual do Top 10 — matriz por motivo e seção recolhível
Em 28/10/2026 o Top 10 do Dashboard central foi redesenhado com base na referência visual enviada pelo usuário.

Novo formato:
- colunas fixas: Ranking, Driver, 3PL e Total;
- após Total, cada motivo de ocorrência vira uma coluna;
- somente motivos com quantidade maior que zero entre os Top 10 são exibidos;
- motivos sem ocorrência no Top 10 não ocupam espaço;
- cada linha mostra a quantidade daquele motivo para o motorista;
- células sem quantidade ficam vazias;
- motivos são ordenados pela quantidade total no Top 10;
- cabeçalhos dos motivos são inclinados para aproximar a leitura da referência;
- Driver exibe também o Driver ID;
- 3PL permanece visível;
- Total mostra a quantidade total de ocorrências do motorista no dia;
- o cabeçalho do Top 10 ganhou uma seta para recolher/expandir toda a matriz;
- a alteração é somente visual/analítica do Dashboard e não modifica captura, fila, deduplicação ou escrita na aba Dados.


## Atualização 1.3.33 — diagnóstico da fonte de Bairro via Sort Code
Objetivo exclusivo: identificar a fonte técnica do campo `Sort Code Name` usado pela página `#/exceptionOnholdList` e pela exportação. Essa página NÃO deve ser usada como fonte de recebimento, status de recebimento ou data de recebimento.

Evidência fornecida:
- exportação CSV da página com 1.643 registros e coluna `Sort Code Name`;
- o BR aparece em `Order ID` e `SLS Tracking Number`;
- a investigação busca descobrir a API/lista/exportação que fornece o Sort Code sem depender do endpoint sensível `show_sensitive_data`.

A 1.3.33 adiciona diagnóstico passivo somente para essa investigação:
- reconhece a rota `#/exceptionOnholdList`;
- captura fetch/XHR da própria origem durante carga da lista e exportação;
- procura sinais `Sort Code Name`, `sort_code_name`, `sortCodeName`, `sort_code`, bairro/district/neighborhood e BRs;
- registra endpoint, método, body, Content-Type, Content-Disposition, trecho da resposta e campos relevantes;
- mantém os registros apenas em localStorage técnico `spxdv:neighborhood-network-diag-v1`;
- adiciona botão flutuante `Bairro diag` somente nessa rota, com opções Copiar/Limpar/Fechar;
- nenhuma informação capturada nessa versão altera o Bairro operacional;
- nenhuma lógica de recebimento, Dashboard, recomendação, planilha ou Return é alterada.

Validação necessária:
1. carregar a 1.3.33;
2. abrir Tratativa de exceção > Detalhes de ocorrências (`#/exceptionOnholdList`);
3. atualizar/pesquisar a lista;
4. fazer uma exportação como no vídeo;
5. abrir `Bairro diag`;
6. copiar o diagnóstico e enviar para análise.


## Atualização 1.3.34 — captura de metadados da tarefa de exportação do Bairro
O diagnóstico 1.3.33 confirmou no ambiente real:
- criação da exportação por `POST /api/in-station/uni_receive/on_hold/list/export`;
- consulta da tarefa por `/spxdata/api/export_platform/export_task/list_for_portal`;
- no schema da exportação, `buyer_addr_district` é mapeado exatamente para `Sort Code Name`;
- a API normal `/api/in-station/uni_receive/on_hold/list` não expõe `buyer_addr_district`.

A 1.3.34 continua exclusivamente diagnóstica e passa a registrar:
- resposta completa (curta) da criação da exportação;
- campos da tarefa relacionados a task/file/url/download/result/status/name/path/object/OSS/COS/bucket/export/link/key;
- URLs e nomes de arquivos CSV/XLS/XLSX encontrados dentro da resposta;
- exibição desses campos no modal `Bairro diag` e inclusão no conteúdo copiado.

Objetivo: descobrir a referência final do arquivo gerado para então implementar a leitura do `buyer_addr_district` por BR sem consumir `show_sensitive_data`.

A página `exceptionOnholdList` continua proibida como fonte de recebimento/data/status do Dashboard.


## Atualização 1.3.35 — captura do link assinado da exportação do Bairro
O diagnóstico real da 1.3.34 confirmou:
- criação da exportação retorna `task_id`;
- quando concluída, a tarefa passa a `export_status=2` e recebe `file_name` no formato `mms://...`;
- em seguida o portal chama `GET /spxdata/api/export_platform/export_task/get_signed_download_url?source=fms&task_id=<id>`.

A 1.3.35 registra especificamente a resposta desse endpoint de link assinado e extrai seus campos técnicos (url/file/path/result/download etc.) para o `Bairro diag`.

Objetivo: obter a URL temporária do CSV e validar a leitura automática de `buyer_addr_district` (Sort Code Name) por BR, sem download manual e sem usar `exceptionOnholdList` para recebimento.


## Atualização 1.3.36 — recebimento real como fonte da Dashboard + Bairro por Sort Code + envio explícito em lote
Em 28/10/2026 um HAR real da tela `singleReceiveNew` identificou a chamada autoritativa de recebimento:
`POST /api/in-station/uni_receive/order`.

A resposta real observada retorna `retcode=0`, `data.task_operator` e `data.order_list[]` com `shipment_id` e `receive_time`. A partir da 1.3.36:
- colar/digitar/pressionar Enter no campo TN continua sendo apenas consulta/preview;
- Enter NÃO cria mais ficha no Dashboard;
- a ficha só é criada quando a resposta real de `/api/in-station/uni_receive/order` retorna sucesso;
- `received_at` usa o `receive_time` devolvido pelo próprio SPX;
- `operator_login` prioriza `data.task_operator`;
- a captura confirmada monta motivo, motorista, Driver ID, 3PL, fluxo e ocorrência e salva SOMENTE na fila central;
- o POST legado sem `action` no Apps Script também deixou de gravar automaticamente na aba `Dados`.

### Envio explícito para Dados
O Dashboard passou a ser a fila de revisão:
- registros com status `captured` significam aguardando envio, não erro temporário;
- não existe mais grace period de 30 segundos para considerar pendência;
- botão `Enviar X para a planilha` envia todos os registros ainda não confirmados, incluindo pendentes antigos;
- somente após esse envio o Apps Script grava C:G e I:J em `Dados`, registra a chave BR+timestamp em `_SPX_DV_CONTROLE` e marca a ficha como `confirmed`;
- duplicidades já presentes em `_SPX_DV_CONTROLE` são apenas reconciliadas como confirmadas;
- pendências antigas continuam preservadas na virada do dia;
- limpeza manual continua removendo somente registros já enviados/confirmados.

### Bairro via Sort Code Name
A investigação da exportação de `#/exceptionOnholdList` confirmou:
- `buyer_addr_district` é exportado como `Sort Code Name`;
- criação: `POST /api/in-station/uni_receive/on_hold/list/export`;
- conclusão consultada em `/spxdata/api/export_platform/export_task/list_for_portal`;
- URL temporária obtida em `/spxdata/api/export_platform/export_task/get_signed_download_url`;
- a URL assinada vem em `data.download_url` e é temporária.

Na 1.3.36:
- o módulo pode disparar uma atualização da exportação em lote, com cooldown de 10 minutos;
- quando a tarefa conclui, envia a URL assinada para o Apps Script;
- o Apps Script baixa o CSV no servidor, mantém somente `BR + Sort Code Name` e descarta nome, telefone e endereço;
- cache central em aba oculta `_SPX_DV_BAIRROS`;
- fichas normais LMHub sem Bairro são enriquecidas automaticamente pela cache;
- o módulo consulta a cache central por JSONP para exibir Bairro sem consumir `show_sensitive_data`;
- para `Return_LMHub`, a exportação conhecida não fornece `seller_addr_district`; por isso o endpoint sensível permanece somente como fallback de Return.

A página `exceptionOnholdList` e suas datas/status NÃO são usadas como fonte de recebimento. Ela serve exclusivamente como fonte técnica da base de Bairro.

### Validação obrigatória da 1.3.36
Esta versão passou apenas por validação estática/sintática. Antes de considerar estável:
1. atualizar e reimplantar o Apps Script mantendo a mesma URL `/exec`;
2. desativar/ativar o módulo para carregar a 1.3.36;
3. colar um BR sem receber e confirmar que NÃO aparece no Dashboard;
4. receber um BR de verdade e confirmar que aparece no Dashboard com horário do SPX;
5. aguardar a atualização de Bairro e confirmar `Sort Code Name` no Dashboard/painel;
6. confirmar que nada foi gravado em `Dados` automaticamente;
7. clicar `Enviar X para a planilha` e validar a gravação correta em C,D,E,F,G,I,J;
8. validar deduplicação e preservação de pendentes antigos.


## Atualização 1.3.37 — diagnóstico de geolocalização comprador/vendedor
Em 28/10/2026 um vídeo real confirmou que a tela:
`#/orderDetail/<BR>/sender_info?originUrl=%2ForderTracking&module=hubDeliveryManagement&stationType=HUB`
exibe duas fontes de geolocalização na seção `Informações comprador/vendedor`.

Regra operacional observada:
- fluxo LMHub normal: usar o localizador superior, ligado ao destinatário/comprador;
- fluxo Return_LMHub: usar o localizador inferior, ligado ao remetente/vendedor.

Ao clicar no ícone do localizador, o próprio SPX abre um mapa no ponto das coordenadas exibidas pela página. Isso indica que latitude/longitude já estão disponíveis no frontend antes da abertura do mapa.

A 1.3.37 é diagnóstica e NÃO usa geolocalização como Bairro ainda:
- adiciona captura passiva de fetch/XHR somente na rota `orderDetail/.../sender_info`;
- procura pares latitude/longitude em campos JSON e em strings de resposta;
- registra somente endpoint, body técnico limitado, paths dos campos e coordenadas detectadas;
- evita copiar nome, telefone e endereço como parte do diagnóstico;
- adiciona botão flutuante `Geo diag` nessa rota para visualizar/copiar o resultado;
- o diagnóstico não altera recebimento, Dashboard, recomendação, planilha ou fluxo Return.

Para evitar poluir a lista de tarefas do SPX durante a investigação:
- a geração automática da exportação de Bairro foi pausada na 1.3.37;
- a cache já existente de bairros continua podendo ser consultada;
- nenhuma nova tarefa de exportação é criada automaticamente por falta de Bairro nesta versão.

Validação necessária:
1. carregar a 1.3.37;
2. abrir um BR normal em Detalhe do pedido > Informações comprador/vendedor;
3. abrir `Geo diag` e copiar o diagnóstico;
4. repetir com um BR Return;
5. comparar os endpoints/paths e confirmar qual campo corresponde ao localizador superior e ao inferior;
6. somente depois implementar conversão lat/lng -> Bairro.


## Atualização 1.3.38 — validação lat/lng -> Bairro
Em 28/10/2026 o diagnóstico v1.3.37 confirmou a fonte de geolocalização:
`GET /api/fleet_order/order/detail/trade_info?shipment_id=<BR>`.

Campos confirmados:
- LMHub normal / destinatário: `data.buyer_info.buyer_geo_lat` + `buyer_geo_lng`;
- Return_LMHub / remetente: `data.seller_info.seller_geo_lat` + `seller_geo_lng`;
- `data.return_info.return_dest_geo_lat/lng` veio `0,0` nos casos observados e deve ser ignorado.

A v1.3.38 adiciona uma validação controlada de reverse geocoding:
- Apps Script: novo `GET ?view=geo&lat=...&lng=...&callback=...`;
- usa `Maps.newGeocoder().setLanguage('pt-BR').setRegion('br').reverseGeocode(...)`;
- o geocoder recebe apenas lat/lng arredondados a 5 casas; não recebe BR, nome, telefone ou endereço;
- não persiste coordenadas;
- usa CacheService por 6 horas para coordenadas repetidas;
- candidatos de Bairro são coletados por prioridade: `sublocality_level_1`, `neighborhood`, `sublocality`, `administrative_area_level_4`, `administrative_area_level_3`;
- módulo: cada par de coordenadas no `Geo diag` recebe botão `Testar bairro`, exibindo o candidato e até 5 classificações retornadas.

Esta versão ainda NÃO substitui a fonte operacional de Bairro e não grava o resultado geográfico em Dashboard/Dados.
A exportação automática de Bairro continua pausada.

Validação necessária:
1. atualizar/reimplantar o Apps Script preservando o mesmo `/exec`;
2. carregar o módulo 1.3.38;
3. abrir BR com `trade_info` e clicar `Geo diag`;
4. testar `buyer_info` em BR normal e `seller_info` em Return;
5. comparar o bairro retornado com `Sort Code Name`/bairro conhecido em vários BRs;
6. somente após consistência real, migrar `fetchOccurrenceNeighborhood` para `trade_info -> reverse geocoding`.


## Atualização 1.3.39 — Bairro operacional por geolocalização do trade_info
Validação real da 1.3.38 confirmou que o reverse geocoding retornou o bairro correto tanto para:
- BR normal usando `data.buyer_info.buyer_geo_lat/lng`;
- BR Return usando `data.seller_info.seller_geo_lat/lng`.

A 1.3.39 passa a usar essa fonte operacionalmente:
- fonte principal: `GET /api/fleet_order/order/detail/trade_info?shipment_id=<BR>`;
- LMHub normal: coordenadas do comprador/destinatário;
- Return_LMHub: coordenadas do vendedor/remetente;
- `return_dest_geo_lat/lng = 0,0` continua ignorado;
- lat/lng -> Bairro via `GET ?view=geo&lat=...&lng=...` no Web App Apps Script;
- a caixa de recebimento não espera o geocoder para renderizar: mostra `Bairro: Consultando...` e atualiza o texto quando a resposta chega;
- Return também passa a exibir Bairro na caixa;
- recebimento real continua reconhecido exclusivamente por `POST /api/in-station/uni_receive/order` com `retcode=0`;
- captura do Dashboard ocorre em background, portanto o scanner/recebimento do SPX não fica bloqueado pela resposta do geocoder;
- exportação automática de Bairro continua desligada;
- fallback temporário: fluxo normal pode usar a cache central antiga; Return pode usar `seller_addr_district` via `show_sensitive_data` somente se trade_info/geocoder falharem;
- o resultado do geocoder não é persistido/cacheado pelo SPX-DV no Apps Script.

Ainda requer validação real antes de considerar estável:
1. BR normal na caixa deve mostrar `Consultando...` e depois o bairro correto;
2. BR Return deve fazer o mesmo usando seller_geo;
3. bip/recebimento deve continuar fluido mesmo se o geocoder demorar;
4. recebimento real deve criar Dashboard com bairro;
5. envio em lote do Dashboard deve levar o mesmo bairro para Dados.


## Atualização 1.3.40 — geocoding antecipado para reduzir tempo visual do Bairro
Após vídeo real da 1.3.39, o painel apareceu com `Bairro: Consultando...` e o bairro chegou depois. A análise mostrou que o reverse geocoding só começava após parte da montagem de histórico/AT/3PL.

A 1.3.40 reorganiza somente a ordem das chamadas:
- `tracking_info` e `trade_info` são iniciados imediatamente;
- assim que ambos chegam, o fluxo normal/Return já é conhecido e o reverse geocoding começa;
- `recipient_info`, enriquecimento de AT/3PL e demais cálculos seguem em paralelo;
- a prévia do painel não precisa aguardar o Bairro;
- o recebimento real também inicia o Bairro antes do enriquecimento de AT e reaproveita esse resultado na captura do Dashboard, evitando uma segunda chamada de geocoding dentro da mesma captura;
- fonte permanece `trade_info`: buyer_geo para LMHub normal e seller_geo para Return;
- Apps Script não foi alterado nesta versão;
- exportação automática continua desligada.

Objetivo de validação real:
- reduzir ou eliminar o tempo visível em `Bairro: Consultando...`;
- manter o bip/recebimento sem qualquer espera adicional;
- confirmar que normal e Return continuam retornando o bairro correto;
- confirmar que Dashboard/Dados continuam recebendo o mesmo bairro após recebimento real.


## Atualização 1.3.41 — remoção total do fallback sensível de Bairro
Solicitação operacional: não consultar mais o endpoint sensível para completar Bairro.

Mudanças:
- removido do módulo o fallback por `/api/fleet_order/order/detail/show_sensitive_data?data_field=seller_addr_district`;
- `show_sensitive_data` deixa de ser usado operacionalmente pelo módulo para Bairro;
- a fonte principal permanece `trade_info -> buyer_geo/seller_geo -> Apps Script reverse geocoding`;
- no fluxo normal, a cache central antiga `_SPX_DV_BAIRROS` ainda pode ser usada como fallback não sensível;
- no Return, se o geocoder não resolver, Bairro fica vazio;
- na caixa de recebimento, Bairro vazio é exibido como `Atualizar base`;
- `Atualizar base` é somente texto de interface e **não é enviado como valor de Bairro para Dashboard ou Dados**;
- exportação automática continua desligada;
- Apps Script não foi alterado nesta versão.

Validação:
- sintaxe JavaScript validada;
- `assistente.js` não contém mais referência a `show_sensitive_data`;
- validação real no SPX ainda pendente antes de chamar a versão de estável.


## Atualização 1.3.42 — Atualizar base como valor operacional de Bairro
Correção de entendimento da 1.3.41:
- `Atualizar base` não é apenas texto visual;
- se `trade_info -> geocoder` não retornar Bairro e, no fluxo normal, a cache antiga também não tiver valor, o módulo retorna literalmente `Atualizar base`;
- esse valor entra no payload `neighborhood`, aparece no Dashboard e é gravado normalmente na coluna I de `Dados` quando o lote for enviado;
- a expectativa operacional continua sendo que isso seja raro, pois a geolocalização validada deve resolver o Bairro correto na maioria dos casos;
- não foi reintroduzido `show_sensitive_data`;
- exportação automática continua desligada;
- Apps Script não precisou ser alterado.

Validação:
- sintaxe JavaScript validada;
- `assistente.js` continua sem referência a `show_sensitive_data`;
- validação real no SPX ainda pendente.


## Atualização 1.3.43 — correção da captura real antes do carregamento do SPX
Em 29/10/2026 foi relatado que nenhum BR recebido no dia apareceu no Dashboard, apesar de o painel/preview funcionar normalmente.

Diagnóstico no código:
- o recebimento real depende da observação da resposta de `POST /api/in-station/uni_receive/order`;
- essa observação estava dentro do módulo principal `assistente.js`;
- o catálogo registrava o módulo principal em `document_idle`;
- embora rode em `world: MAIN`, nesse momento o aplicativo SPX já pode ter capturado/guardado referências nativas de `fetch` antes da extensão sobrescrevê-las;
- isso pode fazer o painel funcionar normalmente, mas impedir que a chamada real de recebimento passe pelo interceptor instalado tarde;
- o fato operacional observado foi **zero BR no Dashboard**, compatível com essa falha de captura.

Correção:
- novo arquivo `modules/assistente-de-devolucoes/receive-hook.js`;
- o hook roda em `document_start`, `world: MAIN`;
- intercepta exclusivamente respostas de `POST /api/in-station/uni_receive/order` via `fetch` e `XMLHttpRequest`;
- respostas capturadas antes do carregamento do módulo principal ficam em buffer curto no `window`;
- o módulo principal permanece em `document_idle` para não antecipar a UI/DOM;
- `assistente.js` instala uma ponte que consome o buffer e eventos do hook e reaproveita `handleRealReceiveResponse`;
- a deduplicação existente por BR + segundo de recebimento continua protegendo contra dupla captura caso o interceptor antigo também enxergue a mesma resposta;
- nenhuma regra de Bairro, Dashboard, Dados, Return ou recomendação foi alterada;
- Apps Script não foi alterado.

Para ativar a mudança no Chrome:
1. desativar o módulo no popup da extensão;
2. ativar novamente;
3. isso força o loader a registrar os dois scripts e recarregar as abas SPX;
4. conferir que a versão exibida é 1.3.43;
5. fazer um recebimento real e verificar o Dashboard.

Validação:
- sintaxe do hook e do módulo principal validada estaticamente;
- validação real do recebimento e Dashboard ainda pendente;
- não chamar 1.3.43 de estável até confirmar pelo menos um recebimento real.


## Atualização 1.3.44 — diagnóstico ponta a ponta do Dashboard + fallback pelo body
Após teste real da v1.3.43, o SPX mostrou claramente `Recebido com sucesso`, o painel do SPX-DV carregou os dados do BR, porém o Dashboard permaneceu zerado. Portanto o problema não é Bairro, ordenação ou carregamento visual do painel; está na cadeia `recebimento real -> captura -> fila local -> Web App central`.

A v1.3.44 adiciona diagnóstico técnico temporário para localizar exatamente a etapa de falha:
- o hook em `document_start` registra se carregou e se conseguiu sobrescrever `fetch` e `XMLHttpRequest`;
- registra os POSTs vistos em `/api/in-station/*`;
- usa `PerformanceObserver` como evidência adicional das URLs requisitadas pela página;
- registra quantas vezes o endpoint exato `POST /api/in-station/uni_receive/order` foi interceptado;
- registra retcode, quantidade de orders e se havia body de requisição;
- o módulo principal registra as etapas `bridge_event`, `receive_response_seen`, `receive_success_recognized`, `receive_queued`, `process_start`, `process_occurrence_ready`, `local_saved`, `central_send_start` e `central_send_resolved/error`;
- o painel ganhou botão `D` para abrir `DIAGNÓSTICO DO DASHBOARD`, com Copiar/Limpar/Voltar.

Robustez adicional:
- se a resposta `retcode=0` não trouxer `data.order_list[]`, o módulo tenta extrair BR(s) do body do próprio POST de recebimento;
- o fallback aceita JSON, URLSearchParams e busca recursiva por campos relacionados a shipment/tracking/order/TN/SLS;
- nesse caso o sucesso do endpoint continua sendo obrigatório; Enter/paste isolado continua sem criar Dashboard;
- o horário usa `receive_time` da resposta quando existir; sem esse campo, usa o instante da resposta como fallback;
- deduplicação BR + segundo continua ativa.

O objetivo desta versão é que um único próximo recebimento real permita distinguir:
1. hook não carregou;
2. endpoint mudou/não foi visto;
3. resposta foi vista mas não reconhecida;
4. BR foi reconhecido mas falhou ao montar ocorrência;
5. fila local salvou mas envio central falhou;
6. envio central resolveu e o problema está no Apps Script/Dashboard.

Para o teste:
1. desativar/ativar o módulo para garantir que hook + módulo principal estejam registrados;
2. confirmar v1.3.44;
3. fazer um recebimento real;
4. se o BR não aparecer no Dashboard, clicar `D` no painel e usar `Copiar` (ou enviar captura do diagnóstico);
5. não alterar mais a arquitetura antes de ler esse diagnóstico.

Validação:
- sintaxe do hook e do módulo principal validada;
- validação real ainda pendente;
- não chamar v1.3.44 de estável.


## Atualização 1.3.45 — confirmação real do upsert central via JSONP
O diagnóstico da v1.3.44 mostrou com clareza que a cadeia local estava funcionando:
- hook carregado;
- `POST /api/in-station/uni_receive/order` interceptado;
- `retcode=0`;
- 1 order reconhecida;
- BR enfileirado;
- ocorrência montada com Bairro;
- ficha salva localmente;
- chamada central disparada.

O problema restante estava entre navegador e Web App central. O evento `central_send_resolved` não era prova de gravação porque o envio usava `fetch(..., { mode: 'no-cors' })`. Nesse modo, redirecionamento/login/resposta opaca podem resolver a Promise sem permitir saber se `doPost` executou e gravou a ficha.

Correção da v1.3.45:
- novo endpoint de leitura/gravação controlada no Apps Script:
  `GET ?view=dashboard_upsert&payload=<json>&callback=<jsonp>`;
- a gravação usa o mesmo `normalizeDashboardRecord_`, `upsertDashboardRecord_`, lock e `SpreadsheetApp.flush()`;
- o servidor responde em JSONP com:
  - `ok`;
  - `occurrence_key`;
  - `status`;
  - `received_day`;
  - `received_at`;
- o módulo passa a considerar sincronização central concluída somente quando recebe `ok:true`;
- diagnóstico passa a registrar `central_send_confirmed` ou `central_send_error`;
- o envio live de uma ocorrência não usa mais `no-cors` para `dashboard_upsert`.

Recuperação local:
- removida a tentativa automática de `dashboard_merge` com toda a fila local, que no diagnóstico tentou enviar 467 registros e falhou com `Failed to fetch`;
- a recuperação automática passa a considerar somente registros pendentes do dia corrente;
- esses registros são enviados individualmente por `dashboard_upsert` confirmado;
- isso evita URL/body gigante e evita reintroduzir em massa registros legados de dias anteriores cuja origem pode não corresponder ao recebimento real atual.

Importante:
- o Apps Script mudou nesta versão;
- atualizar o arquivo no GitHub **não atualiza a implantação**;
- é obrigatório copiar/reimplantar a nova versão no mesmo Web App, preservando a URL `/exec`;
- depois, desativar/ativar o módulo para carregar a v1.3.45.

Validação esperada:
1. após redeploy do Apps Script e carga da v1.3.45, o registro local do teste da v1.3.44 pode ser reenviado automaticamente se pertencer ao dia atual e estiver pendente;
2. um novo recebimento real deve gerar `central_send_confirmed`;
3. o BR deve aparecer no Dashboard sem depender de refresh manual;
4. somente depois disso testar o envio em lote para `Dados`.

Validação técnica:
- sintaxe do módulo e do Apps Script validada estaticamente;
- validação real ainda pendente;
- não chamar v1.3.45 de estável.


## Atualização 1.3.46 — remover replay automático e loading contínuo
Após o teste da v1.3.45, o Dashboard ainda não exibiu os BRs e o ícone da aba ficou em looping de carregamento.

Causa encontrada no módulo:
- `syncLocalDashboardToCentral()` era chamado automaticamente ao iniciar a tela de recebimento;
- a mesma função era chamada novamente ao abrir o Dashboard;
- se existissem muitos registros locais do dia, o módulo enviava vários JSONPs sequenciais;
- cada JSONP podia esperar até 9 segundos caso o Web App não chamasse o callback;
- isso mantinha a página em estado de carregamento por tempo prolongado e interferia no uso normal do SPX.

Correção:
- removido o replay automático da fila local ao iniciar o módulo;
- removido o replay automático ao clicar em `Dash`;
- a fila local continua preservada e a migração local continua disponível;
- recebimentos novos continuam sendo enviados individualmente após confirmação real do SPX;
- `sendDashboardUpsertJsonp` agora encerra imediatamente quando o recurso termina de carregar sem executar o callback JSONP;
- com isso, uma implantação antiga/redirecionamento/resposta incompatível não deixa o ícone da aba girando por vários segundos;
- Apps Script não mudou nesta versão; continua sendo necessário que a implantação contenha o endpoint `view=dashboard_upsert` adicionado na 1.3.45.

Teste recomendado:
1. garantir que o Apps Script da 1.3.45+ esteja reimplantado na mesma URL `/exec`;
2. desativar/ativar o módulo e confirmar v1.3.46;
3. recarregar a tela SPX e verificar que a aba não permanece em loading;
4. fazer um único recebimento real;
5. abrir o diagnóstico `D`;
6. esperar `central_send_confirmed`;
7. confirmar o BR no Dashboard.

Validação:
- sintaxe do módulo validada;
- validação real ainda pendente;
- não chamar v1.3.46 de estável.


## Atualização 1.3.47 — auditoria aprofundada da cadeia de recebimento/Dashboard
Motivação: após as versões 1.3.43–1.3.46, o usuário pediu uma revisão completa para antecipar falhas antes de novos testes, pois surgiram problemas que as validações anteriores não haviam previsto.

### Evidência real já obtida
O diagnóstico da v1.3.44 comprovou no SPX real:
- o hook em `document_start` carregou;
- `fetch` e XHR foram patchados;
- `POST /api/in-station/uni_receive/order` foi visto via XHR;
- resposta veio com `retcode=0`;
- `data.order_list` trouxe 1 pedido;
- BR `BR261688874664Y` foi reconhecido;
- operador `italo.soares@shopee.com` foi capturado;
- ocorrência foi montada;
- Bairro `Pedreiras` foi resolvido;
- registro foi salvo localmente;
- o antigo envio central apenas “resolveu” por `no-cors`, sem prova de gravação.

Isso isolou o problema no trecho navegador -> Web App central, não na captura do SPX nem na montagem da ficha.

### Falhas de arquitetura encontradas na auditoria
1. **Falso sucesso central:** `saveDashboardRecord()` salvava localmente, disparava `sendCentralDashboard()` com `void` e retornava sucesso mesmo se o Web App falhasse.
2. **Propagação quebrada:** `captureConfirmedOccurrenceToDashboard()` ignorava o retorno de `saveDashboardRecord()` e sempre retornava `true`.
3. **JSONP com ficha inteira na URL:** a 1.3.45/1.3.46 usava GET/JSONP mutável com login/motorista/agência no query string, sujeito a limite de URL e exposição desnecessária.
4. **Leitura competindo com escrita:** `getDashboardData()` usava `ScriptLock`, fazia cleanup/reconcile e era chamado pelo Dashboard a cada 5 s, podendo bloquear os upserts de vários operadores.
5. **Polling sobreposto:** não havia trava de requisição em andamento no HTML do Dashboard.
6. **Duas capturas da mesma resposta:** o hook novo e o diagnóstico de rede antigo chamavam `handleRealReceiveResponse`; a deduplicação segurava, mas havia trabalho duplicado.
7. **Lock longo em concorrência:** o doPost aguardava até 30 s pelo lock; durante envio de lote para Dados isso podia criar fila/timeout de recebimentos novos.
8. **Migração local repetida:** a fila legacy podia ser migrada novamente a cada recarga; com centenas de registros isso podia atrasar um recebimento novo.
9. **Falha silenciosa após todos os retries:** a ficha ficava local, porém sem aviso claro ao operador.
10. **Replay legado perigoso:** versões anteriores chegaram a tentar sincronizar centenas de registros locais antigos; isso não pode voltar.

### Arquitetura 1.3.47
Fluxo central:
`retcode=0 do SPX -> montar ficha -> salvar outbox local -> health do Web App -> POST dashboard_upsert com JSON no body -> GET/JSONP dashboard_check apenas com occurrence_key -> somente então central_send_confirmed`

Regras:
- o POST continua levando os dados no body; a ficha não vai mais na URL;
- novo `GET ?view=health&callback=...` informa build/capabilities do deploy ativo;
- novo `GET ?view=dashboard_check&occurrence_key=...&callback=...` confirma que a ocorrência realmente existe na aba central;
- `central_send_confirmed` só existe depois desse read-back;
- deploy antigo/incompatível gera `central_health_error`, evitando teste às cegas;
- falha central retorna `false` e mantém a fila de retry ativa;
- após esgotar retries, registro continua local e aparece aviso visual `Dashboard pendente: <BR>. Use D > Reenviar novos.`;
- a chave é removida de `confirmedReceiveSeen` no esgotamento para não bloquear uma futura nova tentativa;
- botão `D -> Reenviar novos` reenviará no máximo 10 registros e **somente** registros marcados com `sync_generation = 1.3.47` e `central_sync = pending`; não toca nos centenas de registros legacy;
- não há replay automático ao abrir tela nem ao abrir Dash.

Concorrência:
- `doPost`/upsert usa `tryLock(1200)`; se outro processo estiver ocupando o lock, falha rápido e o módulo faz retry/read-back em vez de ficar 30 s bloqueado;
- leitura `getDashboardData()` não usa mais ScriptLock e não executa cleanup/reconcile no polling;
- HTML do Dashboard impede chamadas `getDashboardData()` sobrepostas;
- receive-hook é a única fonte que chama `handleRealReceiveResponse`; o interceptor genérico antigo continua apenas para diagnósticos de Return/Geo.

Migração local:
- adicionada chave `spxdv:dashboard-migration-v2-done`;
- registros legacy já existentes no IndexedDB não são regravados;
- migração é marcada como concluída após sucesso;
- os 467 registros antigos observados anteriormente não são enviados automaticamente ao servidor.

### O que ainda NÃO foi implementado de propósito
O usuário definiu uma nova regra futura para o Dashboard, mas pediu primeiro validar a entrada central:
- histórico por **mês calendário** (01 até 30/31), não janela móvel de 30 dias;
- única pendência é “ainda não enviado para Dados”;
- enviados devem permanecer no Dashboard e ficar verdes;
- se houver pendentes de ontem, eles devem ser enviados antes dos de hoje;
- dias diferentes não podem ser misturados em `Dados`;
- a linha verde da planilha continua marcando a virada do dia;
- se virar o mês com pendência do último dia, ela deve permanecer até ser enviada.

**Essas regras ainda não estão implementadas na v1.3.47.** Não alterar retenção/envio por dia até primeiro confirmar que os recebimentos reais entram corretamente no Dashboard central.

### Limitação que continua existindo
`sendPendingDashboardToData()` ainda usa lock global durante o envio de lote. A 1.3.47 protege o recebimento novo com lock curto + retry + outbox local, mas a regra definitiva de prioridade por dia/linha verde será redesenhada depois da validação da entrada no Dashboard.

### Validação técnica
- sintaxe de `assistente.js`, `receive-hook.js` e Apps Script validada;
- módulo principal/catalog/Apps Script devem ficar em 1.3.47;
- `show_sensitive_data` continua ausente;
- exportação automática de Bairro continua desligada;
- validação real no SPX ainda pendente;
- não chamar v1.3.47 de estável.


## Validação real 1.3.47 — entrada central confirmada ponta a ponta
Em 29/10/2026 a v1.3.47 foi validada no SPX real para a cadeia de entrada no Dashboard.

Evidência observada no diagnóstico:
- hook carregado com `fetch patch=true`, `XHR patch=true` e PerformanceObserver ativo;
- 2 chamadas ao endpoint real `POST /api/in-station/uni_receive/order` foram vistas;
- uma chamada retornou `retcode=120508006` para `BR265006408196I`, com mensagem de pedido interceptado/Tratativas; o módulo registrou `receive_response_not_success` e **não criou ficha**, como esperado;
- a chamada seguinte retornou `retcode=0` com 1 order;
- BR recebido: `BR265987435609F`;
- operador capturado: `italo.soares@shopee.com`;
- `received_at=1793303552000` veio da resposta real de recebimento;
- ocorrência usada: `occurrence_timestamp=1793295589`;
- Bairro resolvido: `Centro`;
- etapas confirmadas: `bridge_event -> receive_response_seen -> receive_success_recognized -> receive_queued -> process_start -> process_occurrence_ready -> local_saved -> central_send_start -> central_health_ok(build 1.3.47) -> central_send_confirmed`;
- `central_send_confirmed` retornou `occurrence_key=BR265987435609F|1793295589`, `status=captured` e `build=1.3.47`;
- portanto o POST central ocorreu e o read-back posterior encontrou a ocorrência no servidor.

Conclusão:
- captura real pelo endpoint SPX: **validada**;
- rejeição de `retcode != 0`: **validada**;
- montagem da ficha/Bairro: **validada neste caso**;
- gravação central + read-back: **validada**;
- build ativo do Web App 1.3.47: **validado**.

Ainda pendente antes de chamar a versão inteira de estável:
- confirmar visualmente o mesmo BR no HTML do Dashboard;
- testar vários recebimentos rápidos em sequência;
- testar simultaneamente outro login/perfil alimentando o mesmo Dashboard;
- validar ordem cronológica sob concorrência;
- só depois testar o envio em lote para `Dados`;
- regras futuras de histórico mensal e prioridade por dia ainda não foram implementadas.

Observação sobre logs antigos:
- entradas `local_resync_done`/reenvios com horário anterior ao carregamento do hook atual pertencem a testes/versões anteriores persistidos no diagnóstico e não fazem parte deste fluxo real das 19:52.


## Atualização 1.3.48 — simplificação da leitura visual do Dashboard
Após a v1.3.47 confirmar no SPX real que o BR `BR265987435609F` foi gravado na aba central e encontrado pelo read-back, a investigação foi separada em duas responsabilidades:
1. entrada/gravação central;
2. leitura/renderização do HTML do Dashboard.

A comparação com o código antigo mostrou que a renderização sempre foi simples e muito parecida com a atual; a complexidade surgiu principalmente ao trocar a origem da captura para o recebimento real. Como a cadeia de gravação já foi validada, a v1.3.48 não altera essa arquitetura.

Mudanças:
- `getDashboardData()` passa a calcular no servidor o dia efetivo de cada registro usando `received_at` como fonte principal;
- o servidor devolve explicitamente `today_records` e `old_pending`;
- o navegador deixa de depender exclusivamente de `received_day === today` para decidir quais BRs aparecem em “Recebidos hoje”;
- o Dashboard mostra no cabeçalho o build ativo e quantos registros o servidor devolveu;
- o botão `Dash` abre a mesma janela com parâmetros `build=<versão>&_=<timestamp>`, forçando navegação/reload mesmo quando uma aba com o mesmo nome já estava aberta;
- `central_health_ok` agora exige que o build publicado seja exatamente igual à geração do módulo;
- `dashboard_check` passa a devolver `received_day`, `today` e `visible_today`;
- `central_send_confirmed` registra esses campos no diagnóstico.

Objetivo:
- manter o caminho de gravação robusto da 1.3.47;
- voltar a deixar a exibição do Dashboard simples e autoritativa do lado do servidor;
- eliminar dois riscos de invisibilidade: classificação de dia divergente no cliente e reutilização de HTML antigo numa aba nomeada já aberta.

Teste recomendado:
1. reimplantar o Apps Script 1.3.48 na mesma URL `/exec`;
2. desativar/ativar o módulo e confirmar v1.3.48;
3. clicar `Dash` novamente para forçar recarga;
4. confirmar no cabeçalho do Dashboard `servidor 1.3.48`;
5. verificar se os registros já gravados aparecem, especialmente `BR265987435609F`;
6. em novo recebimento, confirmar no diagnóstico `central_send_confirmed` com `visible_today=true`.

Validação:
- a captura/gravação central da 1.3.47 continua sendo a base e já possui validação real;
- a simplificação visual 1.3.48 passou por validação estática/sintática;
- validação visual real ainda pendente;
- não chamar 1.3.48 de estável antes desse teste.


## Atualização 1.3.49 — Dashboard com dados embutidos no HTML
Motivação: mesmo após a v1.3.47 comprovar que as ocorrências realmente existiam na aba central e a v1.3.48 simplificar a classificação de “hoje”, o usuário relatou que o Dashboard continuava sem qualquer informação, antes e depois de novos recebimentos.

Auditoria específica da página:
- `doGet(view=dashboard)` já usava `HtmlService`, portanto o HTML em si estava sendo servido corretamente;
- o JavaScript embutido no `dashboardHtml_()` foi extraído e validado separadamente; não havia erro de sintaxe;
- a fragilidade restante era o carregamento de dados depender de `google.script.run.getDashboardData()` somente depois que a página já tinha aberto.

Correção:
- `doGet(view=dashboard)` chama `getDashboardData()` no próprio servidor antes de gerar a página;
- o resultado é embutido no HTML como `INITIAL_DATA`;
- o estado inicial do Dashboard passa a ser `state.data = INITIAL_DATA`;
- a primeira renderização ocorre imediatamente por `render()`, sem depender de chamada assíncrona posterior;
- se `getDashboardData()` falhar na geração, o erro é embutido e exibido no próprio Dashboard;
- criado `GET ?view=dashboard_data&callback=...` para atualizações posteriores por JSONP;
- o polling de 5 s e o botão Atualizar usam `dashboard_data`, não `google.script.run`;
- o `health` anuncia `dashboard_data:true`;
- o módulo 1.3.49 exige build 1.3.49 e capability `dashboard_data`.

Consequência operacional:
- abrir o Dashboard já deve mostrar os registros existentes na base central;
- não é necessário bipar outro BR para testar a exibição;
- se a página abrir sem registros na 1.3.49, ela deve pelo menos mostrar no cabeçalho o build/quantidade ou um erro explícito de carregamento;
- isso reduz drasticamente a dependência do bridge interno do HtmlService para a parte mais básica: mostrar dados.

Validação técnica:
- sintaxe do Apps Script validada;
- JavaScript contido dentro do `<script>` do Dashboard validado separadamente;
- captura real `/uni_receive/order` e read-back central não foram alterados;
- validação visual real ainda pendente;
- não chamar 1.3.49 de estável antes do teste.
