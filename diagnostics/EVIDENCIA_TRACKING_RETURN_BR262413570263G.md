# Rastreio Return — BR262413570263G
Coleta manual F12 fornecida pelo usuário em Texto colado(2).txt, analisada em 17/11/2026. Origem: resposta tracking_info?shipment_id=BR262413570263G da página de detalhes. Horários abaixo em America/Sao_Paulo. Índices dos arrays iniciam em zero; são posições desta captura, não seletores estáveis.

## Evidência
Resposta retcode=0. No rastreio, AT20261030C076F aparece em data.tracking_list[13].children[4].message e [6].message (30/10). AT20261104C6DT1 aparece nos filhos [8], [9], [10], [11] desse mesmo grupo (04/11). São eventos antigos em XPT, não prova de vínculo com a ocorrência Return de 16/11 em Itajaí. Não usar essas ATs como fallback automático.

Eventos atuais em data.tracking_list[23].children:
| Índice | timestamp | Horário local | status | message |
|---|---|---|---|---|
| 6 | 1794789230 | 15/11 21:33:50 | 119 | Adicionando pedido a Assignment Task |
| 8 | 1794823095 | 16/11 06:58:15 | 120 | Pedido adicionado a Assignment Task |
| 9 | 1794823656 | 16/11 07:07:36 | 124 | Pedido em devolução ao vendedor |
| 10 | 1794833117 | 16/11 09:45:17 | 126 | Devolução em espera: [Endereço não encontrado] |
| 11 | 1794932310 | 17/11 13:18:30 | 10 | Pedido em devolução |
| 12 | 1794932311 | 17/11 13:18:31 | 119 | Adicionando pedido a Assignment Task |
| 13 | 1794934104 | 17/11 13:48:24 | 120 | Pedido adicionado a Assignment Task |
| 14 | 1794934109 | 17/11 13:48:29 | 10 | Pedido em devolução |

Todos esses eventos têm station_id=5459, station_name=LM Hub_SC_Itajaí_Espinheiros. Campos third_party_name e 3pl_name vazios. Eventos 119/120 acima não contêm código da AT nem campo preenchido com seu identificador. O driver ID 126922 aparece no operator dos filhos 9 e 10; nomes pessoais foram omitidos neste registro. Filhos 11 e 14 têm tags=["Single"]. São dois eventos distintos no rastreio: não presumir duplicidade de captura nem inserir automaticamente recebimentos históricos no Dashboard.

## Cruzamento das fontes já coletadas
- order_info: ver EVIDENCIA_ORDER_INFO_RETURN_BR262413570263G.md. Sem AT/transportadora comprovada. return_sp_station_name é ponto de retorno, não evidência de transportadora.
- reallocation_history: ver EVIDENCIA_REALLOCATION_RETURN_BR262413570263G.json. Lista null, total=0.
- tracking_info: confirma atribuições, motorista, ocorrência e eventos de recebimento, mas não resolve a AT do Return atual.

## Próxima coleta
Inspecionar a tela real de atribuições de Return, capturando URL do endpoint, método, payload dos filtros e resposta. Procurar BR262413570263G ou driver126922 em 16/11/2026; motorista/data são pistas, não prova suficiente. Exigir vínculo BR → AT → transportadora e distinguir atribuições posteriores de 17/11.
Não repetir as três coletas acima sem motivo novo. A ausência nestas respostas não prova ausência em outras fontes da página.
Nenhum código operacional foi alterado neste registro. Atualização 1.3.72 continua aguardando decisão/validação do usuário.
