# PROJECT_MASTER_CONTEXT — SPX-DV

> **Arquivo mestre para continuidade entre conversas.**
>
> Repositório: `RAlDE/spx-dv`
>
> Projeto: **SPX-DV / Assistente de devoluções**
>
> Regra para futuras conversas: **antes de alterar qualquer código, ler este arquivo, o `PROJECT_CONTEXT.md`, o `README.md`, o `catalog.json` e o arquivo principal `modules/assistente-de-devolucoes/assistente.js`.**
>
> Este arquivo consolida a história do projeto, decisões operacionais, arquitetura, versões, testes, erros já cometidos e regras que não devem ser reinterpretadas sem aviso.
>
> Última versão validada em ambiente real: **1.3.18**
>
> Última atualização consolidada: **21/10/2026**

---

## 1. PRINCÍPIO CENTRAL DO PROJETO

O desenvolvimento do SPX-DV é **incremental**.

O objetivo não é reinventar a lógica a cada nova ideia. O que já foi planejado e validado deve ser preservado. Novas necessidades devem ser adicionadas como extensão do fluxo existente.

Antes de qualquer alteração que possa mudar comportamento:
1. comparar a nova ideia com o planejamento original;
2. identificar se ela muda alguma regra já validada;
3. avisar explicitamente antes de alterar caso exista divergência;
4. apontar riscos operacionais e efeitos colaterais;
5. preferir adição à lógica existente, e não substituição;
6. quando houver dúvida sobre um campo/status da SPX, primeiro diagnosticar a fonte real, depois implementar;
7. só considerar uma versão estável após teste real no SPX.

O assistente deve **criticar e aconselhar** quando uma nova ideia puder prejudicar o fluxo já planejado, mesmo que a ideia tenha partido do usuário.

---

## 2. O QUE É ESTE PROJETO

Extensão Chrome modular para apoio ao fluxo de recebimento/devoluções da SPX.

Objetivos principais:
- detectar o BR bipado na tela de recebimento;
- consultar histórico de ocorrências;
- exibir motivo, motorista, ID, data/hora e foto;
- traduzir motivos para português;
- gerar recomendação operacional;
- tratar automaticamente o caso “Endereço não encontrado”;
- manter o fluxo de bipagem rápido;
- integrar cancelamentos de endereço com planilha operacional;
- exibir informações de AutoAdd;
- diferenciar corretamente BR normal e BR de retorno;
- manter o código sob controle do repositório próprio.

Repositório:
`github.com/RAlDE/spx-dv`

Este projeto é **separado** do repositório:
`github.com/RAlDE/spx-onhold`

Nunca alterar o SPX OnHold quando a solicitação for sobre SPX-DV, e vice-versa.

---

## 3. ESTRUTURA DO REPOSITÓRIO

Arquivos/pastas principais:

- `README.md`
- `PROJECT_CONTEXT.md`
- `PROJECT_MASTER_CONTEXT.md` — este arquivo
- `catalog.json`
- `extension/`
- `launcher/`
- `owner.json`
- `modules/assistente-de-devolucoes/assistente.js`

O loader Chrome usa um catálogo remoto no GitHub e carrega o módulo principal com cache-busting.

A extensão roda em:
`https://spx.shopee.com.br/*`

Rotas principais de recebimento:
- `#/generalReceiveTaskMgt/singleReceiveNew/`
- `#/generalReceiveTaskOps/singleReceiveNew/`

O painel principal se chama:
**Rastreio do pedido**

---

## 4. INSTALAÇÃO / ATUALIZAÇÃO LOCAL

Fluxo de teste usado pelo usuário:
1. clicar no ícone da extensão;
2. clicar em **Atualizar**;
3. aguardar a mensagem **Atualizado.**;
4. voltar ao SPX;
5. usar `Ctrl+F5`;
6. testar com BR real.

Sempre manter sincronizados:
- versão em `assistente.js`;
- versão em `catalog.json`.

Antes de publicar:
- validar sintaxe com `new Function(script)`.

Já houve erro de sintaxe em projeto relacionado; um erro JS pode fazer a caixa desaparecer completamente. Portanto, validação sintática antes de publicar é obrigatória.

---

## 5. SEGURANÇA / ACESSO

A extensão usa apenas a sessão já autenticada no SPX.

Validação de acesso:
- e-mail corporativo `@shopee.com`;
- permissões:
  - `RESOLVE_EO`
  - `CANCEL_EO_REASON`

A extensão não cria nem amplia permissões corporativas.

---

## 6. HISTÓRICO NORMAL DE OCORRÊNCIAS

Endpoint tradicional:
`/api/fleet_order/order/detail/recipient_info?shipment_id=<BR>&station_type=3`

Histórico normal:
`data.recipient.On_Hold`

Esses dados alimentam os cards normais da caixa, incluindo:
- motivo;
- motorista;
- ID;
- data/hora;
- foto.

Traduções importantes:
- `Cannot find address` → **Endereço não encontrado**
- `Recipient unavailable for parcel` → **Ausente**
- `Recipient change location` → **Mudança de endereço**
- `Reject - Buyers change their mind` → **Rejeitado pelo comprador**
- `Office closed` → **Comércio fechado**
- `Wrongly assigned` / `Out of route` → **Fora de Rota**

---

## 7. APRESENTAÇÃO DA CAIXA

Características já implementadas:
- cabeçalho laranja;
- corpo preto;
- título “Rastreio do pedido”;
- versão ao lado do título;
- caixa movível;
- rolagem própria;
- rolagem continua funcionando mesmo com modal SPX aberto;
- motorista e ID em linhas separadas;
- fontes grandes;
- botão para recolher;
- botão de atualizar;
- botão de diagnóstico `i` introduzido na 1.3.15;
- caixa aparece imediatamente ao entrar na tela de recebimento, antes da primeira bipagem;
- texto inicial: **Aguardando leitura do BR...**

Cores dos motivos:
- motivos válidos para contagem: azul;
- “Mudança de endereço” e “Rejeitado pelo comprador”: vermelho;
- demais: verde.

A cor deve ser aplicada apenas no selo arredondado do motivo.

---

## 8. REGRAS DE RECOMENDAÇÃO

### Motivos válidos para contagem operacional
- endereço não encontrado;
- palavra-chave incorreta ou não informada;
- comércio fechado;
- recusado por terceiros;
- ausente.

### Motivos finais
- não entregar;
- mudança de endereço;
- rejeitado pelo comprador.

### Regra
- última ocorrência = **Fora de Rota** → **REALOCAR / FLEET**
- última ocorrência = motivo final → **RETORNAR AO SOC**
- 3 dias distintos com motivos válidos → **RETORNAR AO SOC**
- endereço pendente → **TRATATIVA DE ENDEREÇO**
- caso contrário → **PROCESSAR PARA ENTREGA**

### Regra crítica
São **3 DIAS DISTINTOS**, não 3 ocorrências.

Exemplo:
duas ocorrências de “Comércio Fechado” no mesmo dia continuam aparecendo como duas ocorrências reais no histórico, porém contam como **1 dia** para a regra dos 3 dias.

Não deduplicar ocorrências apenas porque:
- têm o mesmo motivo;
- aconteceram no mesmo dia;
- ocorreram com poucos segundos/minutos de diferença.

Teste real confirmou que duas ocorrências muito próximas podem ser operacionais e legítimas.

---

## 9. ENDEREÇO NÃO ENCONTRADO

Caso especial com automação.

Quando a ocorrência mais recente é **Endereço não encontrado** e existem botões de tratativa, o módulo observa o modal SPX:
- “Interceptado no Meio do Caminho”
- “Pedido interceptado...”

Cancelamento:
`POST /api/in-station/admin/common_site/eha/cancel_eo_reason`

Payload principal:
```js
{
  shipment_id,
  reason_id: actions.dataset.reasonId || 'ER40',
  reason_desc: 'Onhold with Delivery Address Issue',
  local_lang: actions.dataset.localLang || ''
}
```

Após sucesso:
- marca como **Cancelado**;
- mantém estado visual após releitura durante a sessão;
- usa `sessionStorage` com TTL aproximado de 30 minutos;
- retorna foco ao campo de rastreio;
- permite bipar o próximo pacote sem clicar manualmente.

Essa lógica não deve ser quebrada por mudanças no fluxo Return.

---

## 10. INTEGRAÇÃO COM GOOGLE SHEETS

Planilha:
`https://docs.google.com/spreadsheets/d/1Qa8bCGEdO9moAa4nIZwcyxrQiD3hEbwWxfuYh8L9jGw/edit?gid=907368164#gid=907368164`

Título:
**BUYER - PACOTES 24H**

Abas mensais, por exemplo:
**OUTUBRO 2026**

Estrutura:
- linha 1: datas;
- linha 2: fórmulas/contagem;
- linha 3+: BRs.

Apps Script:
`https://script.google.com/a/macros/shopee.com/s/AKfycbyYCiRSUK7r5kPeI19TFUkfgYr7WR2aCFCGMOJiZiY4rZPWu3j2eppuuMjK6pFAn_bS/exec`

Regra obrigatória:
- bipar o BR **não envia** para a planilha;
- só envia após cancelamento real de “Endereço não encontrado”;
- o mesmo BR pode aparecer várias vezes no mesmo dia se houver novos cancelamentos reais;
- não existe dedupe por BR;
- releitura sem novo cancelamento não deve gerar nova linha;
- não alterar fórmulas, validações, cores ou formatação condicional.

O envio usa `fetch(..., mode:'no-cors')`.
Não afirmar que houve confirmação de resposta da planilha; o navegador não fornece confirmação útil no modo no-cors.

---

## 11. AUTOADD

Existe lógica de AutoAdd que não deve ser confundida com a lógica de ocorrências.

Consulta `tracking_info` procurando evento recente criado pelo operador:
`Admin(Polygon Auto Add)`

Extrai Assignment Task do texto.

Depois consulta tarefas de auditoria:
`/api/in-station/lmhub/audit/task/list`

Depois consulta target:
`/api/in-station/lmhub/audit/target/list`

Pode exibir:
- **AutoAdd na rota X**
- **AutoAdd para o próximo ciclo**

Essa funcionalidade deve continuar independente do filtro Return.

---

## 12. FLUXO NORMAL X FLUXO RETURN

### Fluxo normal
Estados conceituais:
- `LMHub_Onhold`
- `Delivering`

No BR normal:
- mantém o histórico normal do ciclo;
- usa `recipient_info → data.recipient.On_Hold`;
- aplica a regra de 3 dias normalmente;
- não deve sofrer corte de histórico baseado em Return.

### Fluxo de retorno
Estados conceituais:
- `Return_LMHub_Onhold`
- `Return_LMHub_Returning`

Na interface em português, foram vistos:
- `Retorno_LMHub_Em_Espera`
- `Retorno_LMHub_Retornando`
- `Retorno_LMHub_Atribuindo`
- `Retorno_Atribuido_LMHub`
- `Retorno_Recebido_LMHub`

Regra operacional:
- a entrada em **Return_LMHub_Onhold / Retorno_LMHub_Em_Espera** marca a transição do ciclo normal para o ciclo de retorno;
- tudo que aconteceu antes dessa entrada pertence ao ciclo antigo e não deve aparecer nem influenciar a análise atual;
- depois disso, mudanças entre Return OnHold e Return Returning continuam no mesmo ciclo;
- uma nova ida para `Return_LMHub_Returning` não deve apagar ocorrências anteriores válidas do mesmo ciclo Return;
- novas ocorrências do retorno devem permanecer visíveis.

Nunca usar `Delivering` normal como marcador de início do ciclo Return.

---

## 13. FONTE REAL DO HISTÓRICO RETURN

Após várias tentativas, a fonte real foi confirmada como:
`/api/fleet_order/order/detail/tracking_info?shipment_id=<BR>`

O ponto importante é:
**não confiar em um único código numérico isolado para identificar Return OnHold.**

O diagnóstico mostrou casos em que um mesmo status numérico apareceu em eventos semanticamente diferentes.

A classificação atual e validada deve usar a semântica do objeto:
- nome textual explícito:
  - `Return_LMHub_Onhold`
  - `Return_LMHub_On_Hold`
  - `Retorno_LMHub_Em_Espera`
- ou mensagem explícita:
  - `Devolução em espera: [<motivo>]`
- ou `on_hold_reason` dentro de objeto que tenha linguagem clara de devolução/retorno.

O motivo deve ser lido prioritariamente de:
`on_hold_reason`

Fallback:
mensagem `Devolução em espera: [motivo]`

Informações disponíveis no objeto podem incluir:
- `message`;
- `on_hold_reason`;
- `operator`;
- `timestamp`;
- campos alternativos de tempo.

---

## 14. VARREDURA DE DATA/HORA

Para eventos Return, o código aceita campos comuns:
- `timestamp`
- `ctime`
- `event_time`
- `create_time`
- `created_at`
- `created_time`
- `event_timestamp`
- `update_time`
- `time`
- `date`
- `datetime`

Além disso, pode varrer chaves relacionadas a:
- timestamp;
- ctime;
- event time;
- create time;
- created;
- updated;
- date;
- datetime;
- occurred.

Conversão deve aceitar segundos ou milissegundos.

---

## 15. HISTÓRICO DAS VERSÕES IMPORTANTES

### Primeira fase
- v1.2.1: título, traduções, cabeçalho laranja, corpo preto, fontes maiores.
- v1.2.7: rolagem própria da caixa e retorno de foco.
- v1.2.8: refinamentos de rolagem/modal e foco.
- v1.2.9: melhoria consolidada de rolagem/z-index.

### v1.3.2
Correção da versão exibida no título.

### v1.3.3
Cores dos motivos.

### v1.3.4
Cancelamento automático de Endereço não encontrado.

### v1.3.5
Primeira tentativa de persistência visual do Cancelado.

### v1.3.6
Persistência corrigida via sessionStorage.

### v1.3.7
Integração inicial com Google Sheets.

### v1.3.8
Removida trava que impedia registrar o mesmo BR de novo.
Novo cancelamento real pode gerar novo registro.

### v1.3.9
Painel passa a abrir automaticamente ao entrar na tela de recebimento.

### v1.3.10
Primeira tentativa de adicionar “ATUAL DO RETORNO” a partir do tracking.
Não funcionou em todos os BRs reais.

### v1.3.11
Busca recursiva por `Retorno_LMHub_Em_Espera` / `Return_LMHub_Onhold`.
Ainda falhou no SPX real.

### v1.3.12 — abordagem rejeitada
Tentou usar o último `Delivering` como corte.
Problema: isso não representa a entrada no nosso hub e poderia apagar ocorrências válidas do ciclo atual.
Essa abordagem não deve ser retomada.

### v1.3.13
Separou conceitualmente BR normal e BR Return.
Ainda não identificava corretamente o evento real em todos os casos.

### v1.3.14
Passou a reconhecer o texto `Retorno_LMHub_Em_Espera` e mensagens `Devolução em espera`.
Ainda falhou porque a resposta real nem sempre trazia o nome textual no objeto usado pelo código.

### v1.3.15 — diagnóstico
Criou diagnóstico de rede.
Captura `fetch` e `XMLHttpRequest`.
Adicionou botão `i`.
Permitiria observar a fonte real.

### v1.3.16 — hipótese incorreta
Tentou mapear `status 128` diretamente como Return OnHold e `124` como Return Returning.
Teste real mostrou falso positivo.
Apareceu “Não havia pacotes para coletar” como se fosse ocorrência Return.
Conclusão: códigos numéricos isolados não são mapeamento global confiável.

### v1.3.17 — versão validada
Corrigiu falso positivo.
Critério deixou de usar status numérico isolado.
Passou a reconhecer retorno pela semântica do evento.

Teste real em 13/10/2026:
- ocorrências antigas sumiram;
- “Comércio Fechado” foi lido corretamente;
- somente o ciclo Return atual ficou visível;
- recomendação: **PROCESSAR PARA ENTREGA**;
- duas ocorrências reais de Comércio Fechado no mesmo dia foram preservadas;
- regra de 3 dias continua considerando o dia apenas uma vez.

Essa é a referência funcional atual.

---

## 16. CASOS REAIS IMPORTANTES

### Caso 1 — histórico antigo interferindo
Ocorrências antigas:
- 28/09 — Rejeitado pelo comprador
- outras ocorrências do ciclo normal

Depois o BR entrou em fluxo Return.

Objetivo:
- histórico antigo deve desaparecer da análise atual;
- ciclo Return atual deve comandar a recomendação.

### Caso 2 — BR260544875792V
Na tela de detalhes:
- `Retorno_LMHub_Em_Espera`
- mensagem: `Devolução em espera: [Comércio Fechado]`

Versões 1.3.13/14 ainda não filtravam corretamente.

### Caso 3 — BR264020490470K
Diagnóstico real permitiu localizar a estrutura de retorno.

Erro da 1.3.16:
- um objeto de status numérico semelhante trouxe “Não havia pacotes para coletar” e foi classificado incorretamente.

Correção da 1.3.17:
- deixou de confiar no número isolado;
- passou a exigir semântica explícita de Return.

Validação:
- duas ocorrências de **Comércio Fechado** no mesmo dia foram exibidas;
- ambas são legítimas;
- recomendação permaneceu PROCESSAR PARA ENTREGA porque é apenas um dia válido.

---

## 17. DIAGNÓSTICO

A partir da v1.3.15 existe botão `i` no cabeçalho.

O diagnóstico:
- captura respostas do SPX;
- observa fetch e XMLHttpRequest;
- registra endpoints;
- filtra por BR;
- ajuda a identificar onde um evento está realmente vindo;
- pode funcionar em página de detalhes e tela de recebimento.

Regra:
se aparecer um novo comportamento/novo status e não houver certeza de onde vem, **usar diagnóstico primeiro**.
Não ficar criando regex/status por tentativa e erro.

---

## 18. REGRA SOBRE OCORRÊNCIAS DUPLICADAS

Não deduplicar automaticamente ocorrências por:
- motivo igual;
- mesmo operador;
- mesmo dia;
- horário próximo.

O histórico deve refletir as ocorrências reais.

Apenas a regra dos **3 dias distintos** agrupa por dia para decisão operacional.

---

## 19. REGRA SOBRE BR NORMAL

Nunca aplicar a lógica Return em BR normal.

BR normal:
- usa histórico normal;
- mantém ocorrências do ciclo;
- pode alternar LMHub_Onhold e Delivering;
- a contagem de 3 dias deve considerar o histórico desse ciclo.

---

## 20. REGRA SOBRE BR RETURN

Para BR Return:
- identificar a primeira ocorrência real de Return OnHold / Devolução em espera;
- usar essa entrada como fronteira do ciclo;
- esconder histórico normal anterior;
- manter todas as ocorrências válidas do ciclo Return;
- não reiniciar o corte a cada Return Returning;
- não usar último Delivering normal;
- não usar status numérico isolado sem semântica confirmada.

---

## 21. O QUE NÃO DEVE SER ALTERADO SEM AVISO

Não alterar silenciosamente:
- regra dos 3 dias distintos;
- motivos válidos;
- motivos finais;
- comportamento de Endereço não encontrado;
- fluxo de cancelamento automático;
- persistência do Cancelado;
- foco automático no campo após tratativa;
- regra de envio à planilha;
- possibilidade do mesmo BR ser registrado mais de uma vez quando houve novos cancelamentos reais;
- lógica AutoAdd;
- separação entre SPX-DV e SPX OnHold;
- distinção BR normal x Return;
- preservação de múltiplas ocorrências reais no mesmo dia.

---

## 22. METODOLOGIA DE TRABALHO COM O USUÁRIO

O usuário não quer precisar reexplicar o projeto.

Preferências:
- explicações simples;
- mudanças diretas no GitHub;
- depois testa localmente;
- costuma enviar screenshots;
- quer que o assistente aconselhe e critique riscos;
- não quer mudanças conceituais silenciosas;
- quer continuidade entre conversas.

Quando algo que “antes funcionava” quebrar:
- restaurar primeiro o comportamento conhecido e estável;
- depois adicionar a nova necessidade de forma isolada.

Não afirmar que algo funciona em produção apenas porque:
- sintaxe passou;
- teste local passou.

Dizer:
- “sintaxe/local passou”;
- “validação real pendente”.

Só declarar validado após confirmação real do usuário no SPX.

---

## 23. COMO RETOMAR EM UMA NOVA CONVERSA

Mensagem recomendada:

> Quero continuar o projeto SPX-DV do repositório RAlDE/spx-dv. Antes de alterar qualquer coisa, leia PROJECT_MASTER_CONTEXT.md, PROJECT_CONTEXT.md, README.md, catalog.json e modules/assistente-de-devolucoes/assistente.js. Preserve todas as regras já validadas e me avise antes de qualquer mudança que altere o planejamento.

Isso deve ser suficiente para retomar sem reexplicar o histórico.

---

## 24. ESTADO ATUAL

Versão atual:
**1.3.24**

Estado:
**validada em teste real no SPX para separação do ciclo Return.**

Comportamento validado:
- histórico antigo anterior ao Return não aparece;
- motivo Return atual aparece corretamente;
- múltiplas ocorrências reais no mesmo dia são preservadas;
- regra de 3 dias distintos permanece correta.

Próximas mudanças devem partir desta versão como referência, salvo se o usuário solicitar explicitamente outra base.


---

## 25. ATUALIZAÇÃO 1.3.18 — ABERTURA AUTOMÁTICA NO RECEBIMENTO UNITÁRIO

Necessidade operacional confirmada em vídeo:
- usuário navega por `Entrada → Recebimento`;
- na lista `#/generalReceiveTaskOps`, clica em **Recebimento unitário**;
- o SPX navega para `#/generalReceiveTaskOps/singleReceiveNew/<RT>`;
- a caixa do SPX-DV deve aparecer automaticamente, aberta, sem depender de bipagem.

Falha anterior:
- o módulo dependia principalmente de `hashchange`;
- em navegações SPA do SPX, a entrada em `singleReceiveNew` nem sempre reconstruía a caixa.

Regra da 1.3.18:
- detectar mudanças por `hashchange`, `popstate` e observação de `location.href`;
- ao detectar entrada em `singleReceiveNew`, remover UI antiga, resetar estado visual e abrir a caixa;
- forçar `collapsed = false` em cada nova entrada no Recebimento unitário;
- mostrar `Aguardando leitura do BR...` antes da primeira bipagem;
- sair da tela e entrar novamente deve abrir novamente;
- não alterar nenhuma regra funcional de ocorrências ou devolução.

A 1.3.18 foi validada em ambiente real para a abertura automática no recebimento unitário. Ela preserva a lógica Return validada da 1.3.17 e passa a ser a referência atual do projeto.


---

## 26. ATUALIZAÇÃO 1.3.19 — TRANSPORTADORA POR OCORRÊNCIA

Objetivo:
mostrar, em cada ocorrência normal, a transportadora/Agência (3PL) correspondente ao motorista e à AT daquela tentativa específica.

Descoberta real:
1. `tracking_info` contém eventos `Pedido adicionado à Assignment Task [AT...]`;
2. em seguida aparece o evento Delivering (`status 2`) com motorista;
3. depois aparece o OnHold daquela tentativa;
4. a tela Atribuição de Entrega consulta `POST /spx_delivery/admin/assignment/assignment_task/search/v2`;
5. o retorno dessa consulta contém `agency`, `driver_id` e `driver_name`.

Regra implementada:
- cada ocorrência é ligada à AT do ciclo de entrega imediatamente anterior;
- o ID do motorista é usado como validação adicional;
- a Agência (3PL) retornada por essa AT é mostrada no mesmo card;
- ATs diferentes podem produzir transportadoras diferentes dentro do mesmo BR;
- não usar uma única transportadora geral para todo o BR;
- não usar `tracking_info.3pl_name` como fonte principal, pois no caso real analisado esse campo estava vazio;
- a fonte da transportadora é o campo `agency` do `search/v2`.

Caso real usado para validar a associação local:
- AT20261016BAEPX → CAMILA / ID 2308746 → OnHold Cliente Ausente;
- AT20261018BEGXJ → DIEGO / ID 174601 → OnHold Cliente Ausente;
- AT20261020BHHQR → TIAGO / ID 2169742 → OnHold Palavra-chave.

A associação dos três ciclos passou em teste local. A chamada real ao `search/v2` e a exibição da transportadora na tela de recebimento precisam ser validadas pelo usuário no SPX.

A 1.3.18 continua sendo a última versão validada em ambiente real para o conjunto completo anterior. A 1.3.19 é a versão atual em teste para a nova informação de transportadora.


---

## 27. ATUALIZAÇÃO 1.3.20 — 3PL AO LADO DO MOTORISTA

A v1.3.19 foi validada pelo usuário em ambiente real: a transportadora/Agência (3PL) apareceu corretamente por ocorrência.

Na v1.3.20, apenas a apresentação foi simplificada:
- não exibir o rótulo `Transportadora:`;
- mostrar somente o nome da Agência (3PL) ao lado do motorista;
- manter o ID na linha de baixo.

Formato:
`Motorista: <nome> — <agency>`
`ID: <id>`

Toda a lógica funcional da v1.3.19 permanece igual.


---

## 28. AUTOMAÇÃO DA ABA DADOS — PREPARAÇÃO

Planilha:
`14N5jvp164IpA_YRZlgnODhbogCr7rLAjJzuTCzyx4mY`
Aba: `Dados`.

Objetivo:
quando um BR for recebido no Recebimento unitário e houver ocorrência atual válida, enviar automaticamente somente essa ocorrência para a aba Dados.

Mapeamento:
- C Pedido → BR;
- D Motivo do APP → motivo traduzido da ocorrência atual;
- E Driver ID → motorista da ocorrência atual;
- F Motorista → nome do motorista;
- G Transportadora 3PL → `agency` da AT;
- I BAIRRO → bairro conforme fluxo;
- J Data da ocorrência → data da ocorrência atual;
- A, B e H não são tocadas.

Bairro:
- LMHub normal → Bairro do Comprador → `buyer_addr_district`;
- Return_LMHub → Bairro do Vendedor → `seller_addr_district`.
Endpoint sensível confirmado:
`/api/fleet_order/order/detail/show_sensitive_data?shipment_id=<BR>&data_field=<buyer_addr_district|seller_addr_district>`.
O valor vem em `data.data_detail`.

Regras de linha:
- linha verde = encerramento de lote e nunca pode ser usada;
- novos dados começam abaixo da última linha verde;
- dentro do lote, C vazia = linha disponível;
- C preenchida manualmente ou automaticamente = pular;
- fórmulas nas células alvo podem ser substituídas;
- preservar A, B e H.

Idempotência:
uma ocorrência é identificada por BR + timestamp real. O Web App grava essa chave como nota na célula C para não duplicar a mesma ocorrência em rebipes/recarregamentos, sem impedir uma futura nova ocorrência do mesmo BR.

Implementação preparada:
`apps-script/recebimento-onhold-dados.gs`.
O arquivo passou em validação de sintaxe.
A v1.3.20 continua sendo a versão ativa/validada enquanto o novo Web App não estiver implantado. Após receber a URL `/exec`, integrar ao módulo e publicar a próxima versão.


---

## 29. ATUALIZAÇÃO 1.3.21 — ENVIO AUTOMÁTICO PARA DADOS

Web App:
`https://script.google.com/a/macros/shopee.com/s/AKfycbzVqz60x9ZBTt2dL83cxXaaHRMlqhEpU1r7AVlczQFmQSUdNGkyPUQcRsXzY17ImcbNOQ/exec`

Fluxo:
1. operador bipa BR em Recebimento unitário;
2. SPX-DV carrega histórico e identifica o ciclo atual;
3. liga ocorrência normal à AT e à Agência 3PL quando disponível;
4. seleciona somente a última ocorrência do ciclo atual;
5. valida se essa ocorrência está pendente ou acabou de ser recebida naquele scan;
6. busca bairro sensível:
   - LMHub normal → comprador;
   - Return_LMHub → vendedor;
7. envia JSON ao Web App;
8. Web App grava somente C,D,E,F,G,I,J na próxima linha válida da aba Dados;
9. BR + timestamp impede duplicação da mesma ocorrência.

Regra anti-rebip:
- OnHold sem estado posterior → pode enviar;
- estado posterior gerado no próprio recebimento (até 5 min do scan) → pode enviar;
- estado posterior antigo → não enviar.

Teste local com tracking real confirmou os três casos acima.
A nova integração precisa de validação real no SPX e na planilha antes de ser considerada estável.


---

## 30. ATUALIZAÇÃO 1.3.22 — CORREÇÃO DO FILTRO DE PENDÊNCIA

Problema real:
alguns BRs com ocorrência válida, bipados no Recebimento unitário, não eram enviados para a aba Dados.

Exemplo:
`BR268328614230Y`, ocorrência Endereço não encontrado, motorista EDUARDO EDSON FLORES, ID 1732584, SPXOWNFLEET.

Diagnóstico:
a v1.3.21 considerava qualquer evento posterior à ocorrência como sinal de que o OnHold havia terminado. Isso era incorreto porque o tracking possui vários eventos informativos sem mudança de status.

Regra corrigida:
somente eventos que efetivamente encerram a pendência bloqueiam o envio:
- Delivering;
- Delivered;
- Return_LMHub_Returning;
- recebimento/entrada operacional no LMHub.

Eventos de AT, auditoria, endereço e similares não encerram mais a ocorrência.

Se a mudança real de status foi criada pela própria leitura no Recebimento, permanece a tolerância de até 5 minutos em relação ao scan.

A v1.3.22 mantém intactos:
- painel;
- transportadora por AT;
- Return;
- recomendação;
- 3 dias;
- endereço;
- AutoAdd;
- integração antiga;
- Apps Script da aba Dados.

Validação real ainda necessária.


---

## 31. ATUALIZAÇÃO 1.3.23 — TODO BR COM OCORRÊNCIA É ENVIADO

Regra definitiva:
- bipou no Recebimento unitário;
- existe ocorrência no ciclo atual;
- enviar a ocorrência mais recente para a aba Dados.

Removida a tentativa de inferir "ainda pendente" pelo tracking, pois eventos posteriores informativos geravam bloqueios incorretos.

Duplicidade:
- mesma ocorrência = mesmo BR + mesmo timestamp → Web App não cria nova linha;
- nova ocorrência do mesmo BR = timestamp diferente → pode criar nova linha.

Essa regra representa diretamente o objetivo do usuário: todos os BRs recebidos com ocorrência devem aparecer na planilha.


---

## 32. OTIMIZAÇÃO DO WEB APP — SEM DEDUPLICAÇÃO

Decisão do usuário:
confiar no fluxo de recebimento do SPX e remover o controle de duplicidade da planilha.

Mudanças:
- não procurar ocorrências antigas;
- não adicionar notas nas células de BR;
- cada payload recebido gera uma nova linha;
- C:G são gravadas juntas;
- I:J são gravadas juntas;
- busca da próxima linha livre é feita em blocos de 50 linhas;
- linha verde continua sendo separador;
- C preenchida continua sendo ocupação;
- A, B e H não são alteradas.

Benefício esperado:
reduzir bastante as operações do Apps Script sobre uma aba com mais de 258 mil linhas, principalmente eliminando TextFinder e gravações célula a célula.

A extensão continua em v1.3.23; esta mudança é apenas no Web App da planilha.
Para entrar em produção é necessário atualizar o Código.gs no projeto Apps Script e gerar nova versão da implantação existente, preservando a URL /exec.


---

## 33. CORREÇÃO DO WEB APP — DUPLICIDADE E REUSO DE LINHAS

Teste real mostrou:
- rebip da mesma ocorrência duplicava;
- excluir linhas fazia o ponteiro pular os espaços apagados.

Regra corrigida:
- mesma ocorrência = mesmo BR + timestamp → não cria nova linha;
- nova ocorrência do mesmo BR → timestamp diferente → pode criar nova linha;
- deduplicação fica em aba técnica oculta `_SPX_DV_CONTROLE`, sem notas nas células;
- a aba Dados não é varrida para deduplicação;
- linhas vazias apagadas dentro do lote atual são reaproveitadas antes de avançar;
- linha verde continua fechando o lote anterior;
- escrita em bloco C:G e I:J permanece.

A extensão permanece em v1.3.23. A alteração exige atualizar novamente a implantação do Apps Script.


---

## 34. ATUALIZAÇÃO 1.3.24 — FILA INDEPENDENTE DA PLANILHA

Problema real:
alguns BRs eram recebidos normalmente no SPX, mas não iam para a planilha na primeira leitura. Quando bipados novamente, entravam.

Causa:
o processamento da planilha estava preso ao mesmo `currentRequest/currentShipment` usado para cancelar o painel anterior quando chegava um novo BR. Em operação rápida, o próximo bip interrompia o envio anterior.

Nova arquitetura:
- painel continua mostrando somente o BR mais recente;
- cada bip cria uma tarefa independente de planilha;
- tarefa anterior não é cancelada pelo próximo bip;
- cada tarefa busca os dados necessários e envia a ocorrência mais recente;
- Apps Script continua deduplicando BR + timestamp;
- não houve alteração no Web App nesta versão.

Objetivo:
nenhum BR recebido com ocorrência deve ser perdido apenas porque o operador bipou o próximo pacote rapidamente.
