# PROJECT_CONTEXT — SPX-DV

Atualizado em: 2026-10-06
Repositório: RAlDE/spx-dv
Versão atual do módulo: 1.3.16

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
