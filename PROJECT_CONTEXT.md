# PROJECT_CONTEXT — SPX-DV

Atualizado em: 2026-10-06
Repositório: RAlDE/spx-dv
Versão atual do módulo: 1.3.27

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
