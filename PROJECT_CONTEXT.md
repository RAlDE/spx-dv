# PROJECT_CONTEXT — SPX-DV

Atualizado em: 2026-10-06
Repositório: RAlDE/spx-dv
Versão atual do módulo: 1.3.8

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
