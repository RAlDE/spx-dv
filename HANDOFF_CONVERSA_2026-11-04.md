# SPX-DV — Handoff completo da conversa
Data do handoff: 04/11/2026
Projeto: SPX DV E SPX ON HOLD
Repositório deste módulo: RAlDE/spx-dv
Branch principal: main

> OBJETIVO DESTE ARQUIVO
> Este documento foi criado para permitir que outro chat continue o desenvolvimento sem depender do histórico desta conversa. Ele resume decisões, regras obrigatórias, testes reais, versões, problemas encontrados, correções feitas e pendências atuais.
> O repositório SPX-DV é separado do repositório SPX ON HOLD. Nunca misturar alterações entre os dois.

---

## 1. Estado atual

Versão corrente: **1.3.65**

Alinhamento confirmado no Git em 04/11/2026:
- `MODULE_VERSION = 1.3.65`
- `DASHBOARD_SYNC_GENERATION = 1.3.65`
- `SPX_DV_BUILD = 1.3.65`
- `catalog.json = 1.3.65`
- `PROJECT_CONTEXT.md` declara versão atual 1.3.65

Arquivos principais:
- `PROJECT_CONTEXT.md`
- `modules/assistente-de-devolucoes/assistente.js`
- `apps-script/recebimento-onhold-dados.gs`
- `catalog.json`

SHAs dos arquivos no momento da auditoria:
- PROJECT_CONTEXT.md: `05292e2d483c68106e22ef797c1c4c9ca72cd007`
- assistente.js: `0dbd8440a840c367b2ea313087f60ae72eec65e5`
- recebimento-onhold-dados.gs: `2df6d52ac4f248a8e8a34062c265c149bd48252e`
- catalog.json: `16e0b6cd81ce9017178ff2ee6ce45162e22bc394`

Últimos commits funcionais da 1.3.65:
- módulo: `fb0d6685f7a1f60415aa603fb6157ffd6eda8c28`
- Apps Script: `e0294da0613dce88864f229a79673c9d619a084b`
- catálogo: `7e1bee73556bc90856240b0bd0d8b90e4db560f0`
- contexto: `a6ca504a3c900023d1f72980056192e45c2f56c8`

A 1.3.65 **ainda não deve ser chamada de estável**. Existem partes já validadas em ambiente real e outras ainda pendentes de validação.

---

## 2. Regras obrigatórias de trabalho no SPX-DV

Antes de qualquer alteração:
1. ler `PROJECT_CONTEXT.md`;
2. ler `modules/assistente-de-devolucoes/assistente.js`;
3. ler `catalog.json`;
4. ler `apps-script/recebimento-onhold-dados.gs` quando a mudança envolver Dashboard/Web App;
5. buscar o SHA atual imediatamente antes de cada write no Git;
6. preservar tudo que já foi validado em ambiente real;
7. validar sintaxe de JS e Apps Script antes de commit;
8. manter versões alinhadas;
9. documentar toda mudança relevante em `PROJECT_CONTEXT.md`;
10. nunca declarar uma versão estável sem teste real no SPX.

Quando o Apps Script muda:
- reimplantar mantendo a mesma URL `/exec`;
- atualizar a extensão;
- SPX;
- Ctrl+F5;
- testar o fluxo real.

Rotas principais:
- `#/generalReceiveTaskMgt/singleReceiveNew/`
- `#/generalReceiveTaskOps/singleReceiveNew/`

Painel principal:
- “Rastreio do pedido”

Segurança:
- SPX autenticado;
- usuários `@shopee.com`;
- aliases obrigatórios: `RESOLVE_EO` e `CANCEL_EO_REASON`.

Não quebrar a automação já validada de **Endereço não encontrado**.

---

## 3. Planilha central

Spreadsheet ID:
`14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY`

Aba de destino:
- `Dados`

Abas internas:
- `_SPX_DV_CONTROLE`
- `_SPX_DV_DASHBOARD`
- `_SPX_DV_BAIRROS`

Timezone:
- `America/Sao_Paulo`

Arquitetura:
`consulta/preview -> recebimento real SPX -> Dashboard/fila -> revisão -> botão explícito envio -> Dados`

Regras:
- digitação, colagem e Enter fazem apenas preview;
- recebimento normal só entra após `POST /api/in-station/uni_receive/order` com `retcode=0`;
- Dashboard recebe a ocorrência confirmada;
- `Dados` só é gravada pelo botão explícito do Dashboard;
- ocorrência é deduplicada por BR + timestamp/occurrence_key.

---

## 4. Fluxos já validados em ambiente real

### 4.1 Captura normal — base histórica validada
Versão 1.3.47 foi validada com:
- BR: `BR265987435609F`
- operador: `italo.soares@shopee.com`
- receive_time: `1793303552000`
- ocorrência: `1793295589`
- bairro: Centro

Regra importante:
- caminho normal de recebimento não deve ser alterado sem necessidade.

### 4.2 Envio em massa — 1.3.58 REAL VALIDADO
O usuário confirmou:
> “deu certo, a planilha recebeu todos os dados em massa”

Comportamento obrigatório:
- equivalente a **Ctrl+Shift+V / colar somente valores**;
- grava somente C:G e I:J;
- A/B/H intocadas;
- não copiar formatação;
- não alterar cores, bordas, validações, largura, filtros;
- linha verde continua separador e não recebe dado;
- preservar entradas manuais;
- deduplicação por occurrence_key.

### 4.3 Bairro/3PL via AT — 1.3.62 REAL VALIDADO
Caso real:
- BR: `BR266776089724S`
- AT: `AT20261102C36Z9`
- sem geolocalização útil
- Agência (3PL): `SPXOWNFLEET`
- Bairro Principal: `Gravata`

O usuário confirmou que, após 1.3.62, o bairro passou a aparecer corretamente.

Regra preservada:
- quando geolocalização não resolve, usar a AT do tracking;
- a AT explícita no tracking é vínculo válido;
- não apagar Bairro/3PL por divergência de motorista;
- parser de Bairro Principal precisa preservar caminhos aninhados.

---

## 5. Evolução recente por versão

### 1.3.58 — envio em massa
- migração do envio individual para blocos;
- leitura de controle/bairro em memória;
- planejamento de linhas graváveis;
- `setValues()` em grupos consecutivos;
- validação real concluída.

### 1.3.59 — Dashboard ao vivo
Problemas atacados:
- Dash lento para abrir;
- precisava F5 para ver novos recebimentos;
- página branca após envio/limpar por `window.location.reload()`.

Mudanças:
- shell leve;
- `getDashboardLiveState()`;
- revisão em ScriptProperties;
- polling de revisão a cada 2,5 s;
- atualização sem reload;
- filtros preservados.

Validação real completa ainda pendente.

### 1.3.60 — Top 10
Solicitação visual:
- números das ocorrências em branco;
- Total em branco;
- nomes dos motivos em branco;
- remover cabeçalhos inclinados;
- quebra de linha horizontal;
- 3 primeiros com célula de Ranking em vermelho bem leve.

O código atual contém o destaque `top-three-rank`.

Validação visual real ainda pendente.

### 1.3.61 / 1.3.62 — Bairro Principal e 3PL pela AT
Problema:
- 3PL e bairro não apareciam em alguns BRs sem geolocalização.

Correções:
- AT explícita do tracking passou a valer por si só;
- parser mais robusto da resposta da Atribuição de Entrega;
- Agência extraída semanticamente;
- Bairro Principal extraído semanticamente;
- 1.3.62 passou a preservar caminho aninhado, por exemplo `main_district -> name`.

1.3.62 foi validada em ambiente real.

### 1.3.63 — geolocalização mais confiável
Problema:
- Google podia retornar falso bairro, exemplo real citado: `Casa 11`.

Nova lógica:
1. procurar `neighborhood` na coordenada exata;
2. se não houver, testar pontos próximos;
3. 120 m em quatro direções;
4. se necessário, 300 m;
5. bairro próximo só ganha confiança média quando aparece em pelo menos duas direções;
6. resultados isolados ficam baixa confiança;
7. rejeitar padrões como Casa 11, Apto 12, Bloco A, Lote 5, Quadra 7, Torre B, Unidade 3 e números isolados;
8. baixa confiança pode ser substituída pelo Bairro Principal da AT;
9. sem AT, usar melhor resultado geográfico em vez de cair imediatamente em Atualizar base.

Diagnóstico:
- `geo_neighborhood_lookup`
- source
- confidence
- candidatos
- distância

Validação real dessa busca espacial/anti-`Casa 11` ainda pendente.

### 1.3.64 — Return + recuperação de pendências
Problemas:
- contagem do Dashboard menor que o SPX;
- Returns no Dash sem motorista/3PL;
- registros antigos de Bairro/3PL não eram atualizados.

Diagnóstico central em 03/11/2026:
- 1.379 registros em `_SPX_DV_DASHBOARD`;
- 1.357 `LMHub`;
- 22 `Return_LMHub`;
- os 22 Returns estavam sem `driver_name`;
- 192 registros sem Agência/3PL;
- 417 com `Atualizar base`.

Correções:
- recuperar pendências locais de hoje mesmo se foram criadas por versão anterior;
- nunca ressuscitar automaticamente dias antigos;
- Return usa `return_operator_id` + `return_operator_name`;
- 3PL do Return só entra quando uma AT real pode ser compatibilizada pelo mesmo driver ID;
- consulta visual de BR não cria recebimento novo;
- mas, se a occurrence_key já existe no Dashboard, pode reparar Motorista/3PL/Bairro da linha existente.

Caso citado:
- `BR267968453158B`
- Return
- no Dash antigo aparecia Bairro `Volta Grande`, mas Motorista e 3PL vazios.

Validação real da correção de Return ainda pendente.

### 1.3.65 — recibo durável do `retcode=0`
Esta é a versão atual.

Foi encontrado um problema de arquitetura:
- o hook capturava corretamente todos os itens de `data.order_list[]`;
- porém a ficha só era persistida depois de conseguir tracking, trade_info, recipient_info, ocorrência, AT/driver, bairro e payload;
- se o histórico demorasse mais que os retries, o SPX já tinha recebido o BR, mas nenhuma ficha local bruta existia;
- esse BR podia desaparecer do Dashboard.

Nova regra:
- assim que o SPX retorna `retcode=0`, cada item de `order_list[]` gera um recibo local em:
  `spxdv:confirmed-receive-inbox-v1`
- esse recibo é salvo **antes de qualquer enriquecimento**;
- contém receive_key, shipment_id, operador, received_at e dia;
- só é removido depois que a ocorrência aparece confirmada no Dashboard central;
- replay ao entrar na tela de Recebimento;
- replay a cada 60 segundos;
- retry adicional de 10 s;
- recibos antigos (>3 dias) são limpos;
- replay automático usa apenas hoje.

Eventos de diagnóstico:
- `receive_receipt_persisted`
- `receive_receipt_completed`
- `receive_inbox_replay_queued`
- `receive_inbox_replay_empty`
- `receive_capture_exhausted`

Validação real ainda pendente.

---

## 6. Investigação da diferença de contagem

O usuário mostrou:
- SPX Single Receive do próprio RT: **132**
- planilha BUYER - ENDEREÇO NÃO ENCONTRADO: **42**
- esperado no Dash para `italo.soares@shopee.com`: **174**

Dashboard central:
- `italo.soares@shopee.com`: **163**
- `tiago.rsantos@shopee.com`: **1216**
- total: **1379**

Leitura direta da fila central para o usuário:
- **42** = Endereço não encontrado
- **121** = demais motivos
- **0 Return** no recorte do login do usuário naquele momento

Conclusão matemática:
- Endereço não encontrado está completo: 42/42;
- recebimento normal esperado: 132;
- recebimento normal no Dash: 121;
- **faltam exatamente 11 recebimentos normais** para o login do usuário.

Isso eliminou a hipótese de que os faltantes estavam em outro operador ou no fluxo de Endereço não encontrado.

Importante:
- a inbox durável da 1.3.65 impede novas perdas desse tipo;
- os 11 antigos não podem ser reconstruídos pela nova inbox, porque ela ainda não existia quando esses recebimentos ocorreram.

Próxima ação para recuperar os 11:
- obter a lista dos **132 BRs do RT**;
- comparar com os **121 BRs normais** do Dashboard para o login do usuário;
- identificar exatamente os 11 BRs faltantes;
- recuperar apenas esses 11, preservando dedupe e horários reais.

---

## 7. Bairro — regra atual desejada

Objetivo do usuário:
- se existe geolocalização válida, não aceitar um valor absurdo como bairro;
- procurar qual é o bairro daquela localidade;
- se não achar exatamente, procurar o bairro mais próximo;
- não aceitar coisas como `Casa 11`;
- quando necessário, usar a AT.

Hierarquia atual:
1. Google `neighborhood` exato — confiança alta;
2. consenso de bairro próximo — confiança média;
3. base central quando aplicável;
4. resultado geográfico de baixa confiança;
5. se geo baixa e AT tem Bairro Principal, AT substitui;
6. em falha geográfica total, AT continua fallback operacional.

Regra importante validada:
- `BR266776089724S` sem geo útil deve mostrar:
  - 3PL: `SPXOWNFLEET`
  - Bairro: `Gravata`

---

## 8. Return — regra atual

No painel visual, Return já possui:
- `return_operator_id`
- `return_operator_name`

A 1.3.64 passou a usar esses dados no payload do Dashboard.

Para 3PL do Return:
- não inventar;
- só preencher quando uma AT real anterior puder ser compatibilizada com o mesmo driver ID;
- sem vínculo real, 3PL pode permanecer vazia.

Para Bairro:
- geolocalização continua válida;
- Bairro Principal de AT compatível pode ser fallback.

Registros antigos:
- não são todos atualizados automaticamente;
- ao abrir um BR que já existe no central, a 1.3.64+ pode reparar a linha existente sem criar novo recebimento.

---

## 9. Dashboard e envio para Dados

Dashboard:
- recebe registros reais + exceção controlada de Endereço não encontrado;
- operador é o login real SPX;
- filtros por operador e colunas;
- Top 10;
- envio em massa.

Envio para `Dados`:
- somente via botão explícito;
- colar valores;
- preservar formatação;
- C:G e I:J;
- A/B/H intocados;
- linha verde protegida;
- dedupe por occurrence_key;
- envio em massa validado em ambiente real.

---

## 10. Coisas que não devem ser alteradas sem evidência forte

- captura normal exige `retcode=0`;
- preview nunca pode criar recebimento;
- Endereço não encontrado já funciona e não deve ser quebrado;
- envio em massa 1.3.58 é validado;
- Ctrl+Shift+V / valores somente é regra fixa;
- parser aninhado de Bairro Principal 1.3.62 é validado;
- não reintroduzir dependência de evento Delivering para reconhecer AT explícita;
- não apagar Bairro/3PL por simples divergência de motorista;
- Return 3PL não pode ser inventada;
- não chamar versão de estável antes de validação real.

---

## 11. Testes prioritários para o próximo chat

### Teste A — 1.3.65 recibo durável
Após reimplantar Apps Script e atualizar extensão:
1. fazer recebimentos normais reais;
2. verificar que Dashboard acompanha;
3. abrir diagnóstico e procurar `receive_receipt_persisted`;
4. após confirmação central, verificar `receive_receipt_completed`;
5. deixar uma situação de atraso de histórico e confirmar que o recibo continua na inbox e é reprocessado.

### Teste B — Return
Abrir novamente:
- `BR267968453158B`

Esperado:
- Motorista preenchido com dados reais do Return;
- 3PL somente se existir AT compatível;
- linha antiga do Dash pode ser reparada sem criar duplicidade.

### Teste C — Bairro por geolocalização
Usar um BR que antes retornava algo como `Casa 11`.

Esperado:
- não aceitar Casa 11;
- procurar neighborhood real;
- se necessário usar consenso de 120/300 m;
- se geo for baixa confiança e AT tiver bairro, preferir AT.

### Teste D — contagem
Acompanhar novos recebimentos após 1.3.65 e conferir se:
- contagem SPX normal cresce junto com o Dash;
- endereço não encontrado continua somando;
- não surgem novas diferenças.

### Teste E — Top 10 e Dashboard ao vivo
Ainda precisam de validação visual/real completa:
- cabeçalho horizontal;
- números brancos;
- 3 primeiros com ranking em vermelho leve;
- atualização do Dash sem F5;
- pós-envio sem página branca.

---

## 12. Recuperação dos 11 recebimentos antigos

Não inserir manualmente sem comparação.

Fluxo seguro:
1. exportar/obter os 132 BRs do RT do usuário;
2. extrair os 121 BRs normais do central para `italo.soares@shopee.com`;
3. fazer diferença de conjuntos;
4. revisar os 11 faltantes;
5. para cada um, buscar ocorrência real, motivo, motorista, AT, bairro e horário;
6. inserir/upsert apenas se a occurrence_key ainda não existir.

A causa dos 11 foi rastreada para a janela entre `retcode=0` e a persistência tardia da ficha. A 1.3.65 corrige essa arquitetura para o futuro.

---

## 13. Git — resultado da auditoria de 04/11/2026

Repositório:
- `RAlDE/spx-dv`
- branch: `main`

Estado confirmado:
- módulo: 1.3.65
- sync generation: 1.3.65
- Apps Script build: 1.3.65
- catálogo: 1.3.65
- contexto: 1.3.65

Checagens funcionais encontradas no código atual:
- inbox durável de recebimento: presente;
- replay a cada 60 s: presente;
- correção de Return: presente;
- busca de bairro próximo: presente;
- filtro anti-`Casa 11`: presente;
- Top 10 com `top-three-rank`: presente;
- envio em massa: presente;
- `window.location.reload()` removido do Dashboard.

Conclusão da auditoria:
**o Git está atualizado e consistente com a versão 1.3.65.**

Este arquivo de handoff deve ser lido junto com `PROJECT_CONTEXT.md`; em caso de dúvida, o código atual no Git é a fonte de verdade.

---

## 14. Como outro chat deve começar

Ao receber este arquivo:
1. abrir `RAlDE/spx-dv`;
2. ler `PROJECT_CONTEXT.md`;
3. ler o código atual 1.3.65;
4. não assumir que 1.3.65 é estável;
5. continuar pelos testes prioritários da seção 11;
6. preservar as validações reais já registradas;
7. registrar cada nova evidência/alteração no Git.

Fim do handoff.
