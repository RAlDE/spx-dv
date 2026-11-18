# Fonte visual de BR → AT → agência
Evidência fornecida em 17/11/2026: vídeo 20261118-0126-25.0276792.mp4 e imagem image(20261118-013303).png. Inspeção de quadros do vídeo e imagem, sem captura de resposta Network nesta etapa.

## Caminho observado
1. Gestão Audit → Conferência: LM Hub AT/TO, pesquisa pelo SPX TN BR262413570263G.
2. Detalhe VT na rota /#/mercadao/audit-list/vt-detail?vt-task-id=VT202611170NMF4.
3. Campo SPX TN preenchido com BR262413570263G; resultado único na coluna AT/TO: AT20261117CZONV, corredor H-15, Validado. Totais inicial104, final99, bipado101, classificado incorretamente2, faltante5.
4. Visualizar abre detalhe AT/TO da conferência.
5. Entrega → Atribuição de Entrega, rota /#/delivery-assignment/list: consulta ID da AT AT20261117CZONV retorna uma linha, station5459 LM Hub_SC_Itajaí_Espinheiros, Sentido General, corredor H-15, Agência(3PL) SPXOWNFLEET, cidade Itajaí.

## Conclusão e limite
Há fonte visual útil de associação da pesquisa BR com uma AT na conferência e da AT com agência. Não é necessário depender apenas do código AT na mensagem do rastreio.
A AT observada é de 17/11. NÃO comprova a agência da ocorrência de 16/11 09:45:17 (driver126922). É necessário preservar o vínculo temporal; não substituir automaticamente o dado histórico pela atribuição posterior.
Ainda faltam endpoints/payloads/campos JSON da busca da conferência e confirmação do vínculo BR dentro da AT. F12 estava em Elements, portanto esses detalhes não foram demonstrados pelo vídeo.
Próxima coleta: Network → Fetch/XHR na tela Detalhe VT, repetir Procurar com o BR já preenchido; identificar requisição que retorna AT20261117CZONV e coletar URL, payload e response. Em seguida capturar consulta por AT em Atribuição de Entrega se necessário.
Nenhum código operacional alterado.

## Resposta Network recebida depois da evidência visual
Usuário esclareceu que consultou a última VT de hoje e a última AT em que o pacote entrou nessa VT. Objetivo desta coleta: identificar essa atribuição atual.
Correção da transcrição visual: AT20261117CZONV contém letra O, não zero. O valor JSON é autoritativo.
Resposta retcode=0, message=Success, data.total=1:
- data.list[0].target_id = AT20261117CZONV
- data.list[0].binding_entity = H-15
- data.list[0].validation_start_time = 1794933612 (17/11/2026 13:40:12 America/Sao_Paulo)
- data.list[0].validation_end_time = 1794934104 (17/11/2026 13:48:24 America/Sao_Paulo)
- data.list[0].validation_status = 4
- data.list[0].audit_target_type = 2
- data.list[0].belong = false (semântica ainda não verificada)
- initial_qty104, final_qty99, scanned_parcel_qty101, missort_qty2, missing_qty5.
data.all_qty=134, data.validated_qty=134, demais contadores de estado zero. Estes contadores pertencem à conferência e não devem ser interpretados como quantidade recebida do BR.
Resposta não contém shipment_id nem transportadora. Associação ao BR depende dos parâmetros da requisição, ainda pendentes (Request URL completa). Nome parcial visto na imagem: list?shipment_id=BR2624135702…
Horários são de validação da conferência; não presumir que equivalem a recebimento ou atribuição. Próximo passo: coletar Headers/Request URL e Request Method dessa requisição, sem repetir resposta já recebida.

## Endpoint confirmado pelo usuário (Headers)
Método: GET
URL: https://spx.shopee.com.br/api/in-station/lmhub/audit/target/list?shipment_id=BR262413570263G&task_id=VT202611170NMF4&page_no=1&count=24
Parâmetros observados: shipment_id=BR262413570263G; task_id=VT202611170NMF4; page_no=1; count=24.
Resposta correspondente já transcrita acima: data.total=1 e data.list[0].target_id=AT20261117CZONV.
Este endpoint confirma a consulta filtrada BR + VT → AT. Não assume escolha automática da última AT quando houver vários resultados; não assume funcionamento sem task_id.
Próxima lacuna: endpoint da listagem inicial de conferências filtrada pelo BR, que permite descobrir as VTs candidatas e seus horários. Capturar request e response ao pesquisar BR na lista principal Conferência: LM Hub AT/TO (antes de abrir Detalhe VT). Validar ordenação, paginação e significado dos horários antes de selecionar a última VT.
Após isso, confirmar resposta da busca da AT em Atribuição de Entrega para obter o campo exato da agência. Agência visual SPXOWNFLEET já demonstrada; não confundir confirmação visual com contrato JSON.
Nenhuma alteração operacional nesta coleta.

## Busca BR → VTs confirmada no Network
GET https://spx.shopee.com.br/api/in-station/lmhub/audit/task/list?page_no=1&count=24&shipment_id=BR262413570263G

Resposta retcode=0, message=Success, data.total=2. Recorte fiel dos campos necessários (operadores omitidos):
```json
{"retcode":0,"message":"Success","data":{"total":2,"list":[{"validation_task_id":"VT202611170NMF4","station_name":"LM Hub_SC_Itajaí_Espinheiros","create_time":1794925316,"end_time":1794935567,"task_status":3},{"validation_task_id":"VT202611160NJBG","station_name":"LM Hub_SC_Itajaí_Espinheiros","create_time":1794813382,"end_time":1794827391,"task_status":3}]}}
```
Campos: data.list[i].validation_task_id identifica VT; create_time é criação; end_time é término. Neste caso VT202611170NMF4 é a mais recente por create_time: 17/11/2026 11:21:56, término14:12:47 (America/Sao_Paulo). VT202611160NJBG: 16/11/2026 04:16:22, término08:09:51.
Nesta captura a resposta está em ordem decrescente de criação; isso não comprova contrato de ordenação geral. Implementação futura deve considerar data.total, paginação, tarefas em andamento e múltiplos alvos; não assumir list[0] sempre mais recente nem count24 suficiente para todo BR.
Cadeia comprovada neste exemplo: shipment_id → task/list → validation_task_id → target/list com shipment_id e task_id → target_id AT20261117CZONV.
Não confundir criação/término de VT com recebimento do pacote. Esta cadeia identifica AT na conferência consultada; não prova por si só última atribuição global fora das conferências.
Próximo ponto: capturar consulta da AT em Entrega → Atribuição de Entrega para confirmar campo JSON da agência SPXOWNFLEET vista no vídeo. Nenhum código operacional alterado.

## AT → agência: resposta e Headers confirmados
POST https://spx.shopee.com.br/spx_delivery/admin/assignment/assignment_task/search/v2
Fonte: JSON fornecido pelo usuário e imagem image(20261118-015940).png. Payload desta requisição ainda pendente.
Resposta retcode=0, message=Success, data.pageno=1, data.count=20, data.total=1.
Recorte de campos originais:
```json
{"assignment_task_id":"AT20261117CZONV","driver_id":456987,"station_id":5459,"agency":"SPXOWNFLEET","agency_id":96,"is_ownfleet":true,"corridor_cage":"H-15","city":"Itajaí","neighborhood":"Santa Regina","journey_type":3,"status":3,"order_count":96,"assigned_order_count":96,"processed_time":1794934104,"assigned_time":1794934160}
```
Caminhos: data.list[0].assignment_task_id, .agency, .agency_id, .driver_id, .neighborhood. Match exato do assignment_task_id deve preceder uso de agency; nunca usar primeiro resultado sem conferir ID.

### Divergência que precisa ser preservada
BR262413570263G não aparece no campo shipment_id (string de BRs separados por vírgula) desta resposta atual, embora a pesquisa da conferência com esse BR retorne essa AT. Isso não invalida automaticamente o histórico de conferência nem prova remoção: a causa ainda não foi demonstrada. A composição atual da AT não equivale necessariamente ao retrato da conferência. Não alegar vínculo atual do pacote apenas com esta resposta.
Driver atual456987 difere do driver126922 da ocorrência de16/11. Não sobrescrever motorista da ocorrência com motorista da AT posterior. neighborhood=Santa Regina é atributo desta AT; não prova bairro individual do BR.
Agência SPXOWNFLEET confirmada para esta AT no momento da consulta, não como histórico imutável. Próximo passo imediato: capturar aba Payload da requisição v2. Antes de alteração operacional, definir uso da fonte de conferência com sua data/proveniência e tratar casos de múltiplas ATs, BR ausente da composição atual e falta de conferência.
Nomes pessoais, emails, lista de outros BRs e URL de rota foram omitidos do registro por não serem necessários para o mapeamento.

## Payload confirmado — coleta das três consultas concluída
Fonte: image(20261118-020309).png, enviada pelo usuário em17/11/2026.
POST /spx_delivery/admin/assignment/assignment_task/search/v2
```json
{"assignment_task_id":"AT20261117CZONV","pageno":1,"count":20,"search_type":0}
```
Este registro substitui as pendências de Payload mencionadas nas seções cronológicas anteriores.
Mapa completo observado:
1. GET /api/in-station/lmhub/audit/task/list?page_no=1&count=24&shipment_id={BR} → data.list[].validation_task_id e create_time; data.total para paginação.
2. GET /api/in-station/lmhub/audit/target/list?shipment_id={BR}&task_id={VT}&page_no=1&count=24 → data.list[].target_id; data.total.
3. POST /spx_delivery/admin/assignment/assignment_task/search/v2 com payload acima, substituindo assignment_task_id pela AT exata → data.list[].agency, agency_id; conferir assignment_task_id.
Resultado comprovado para a conferência mais recente deste caso: BR262413570263G → VT202611170NMF4 → AT20261117CZONV → SPXOWNFLEET (agency_id96).
Não solicitar novamente esta mesma varredura. Endpoints, parâmetros, campos e recortes de evidência já estão registrados neste arquivo.
Coleta técnica concluída para este exemplo; não equivale a correção implementada nem a validação geral. Permanecem as limitações de composição atual, data da ocorrência, múltiplos alvos/páginas e inexistência de VT descritas acima. Evitar atribuir automaticamente motorista/bairro da AT ao pacote.
Próximo trabalho: ler código/handoff vigente e avaliar integração pontual para transportadora ausente, preservando proveniência e sem bloquear bipagem, sem modificar envio em massa/planilha. Não publicar nova versão operacional apenas pela conclusão desta coleta.

## Esclarecimento do usuário e evidência de 18/11/2026
Regra esclarecida: a transportadora está vinculada ao motorista que carrega a AT. Para a ocorrência, partir de seu driver_id e confirmar a agência do mesmo motorista; não usar indiscriminadamente a última AT/conferência de outro motorista.
Imagem image(20261118-194056).png da tela Atribuição de Entrega, apresentada pelo usuário como AT e motorista do dia16:
- ID da AT: AT20261116CX392
- Motorista: ID126922 (mesmo ID dos eventos124 e126 de16/11 no rastreio coletado)
- Agência(3PL): SPXOWNFLEET
- Estação5459 LM Hub_SC_Itajaí_Espinheiros
- Corredor D-25; bairro principal da AT Espinheiros; status visual Complete.
Evidência visual confirma driver126922 e agência SPXOWNFLEET na mesma linha desta AT. A relação com BR262413570263G e dia16 foi indicada pelo usuário; esta imagem não contém lista de pacotes nem resposta JSON dessa AT. Não declarar que verificamos automaticamente presença do BR nessa AT.
Isso resolve a dúvida visual sobre a transportadora do motorista deste exemplo, sem precisar repetir a varredura completa. Endpoints/payloads já mapeados são reutilizáveis. Uma eventual captura futura de response v2 para esta AT seria validação adicional direcionada, não redescoberta da API.
Não copiar bairro principal da AT como bairro individual do pacote sem fonte adequada. Nenhuma mudança operacional realizada neste registro.

## Atualização visual do BR em18/11/2026
Fonte: image(20261118-194756).png. Cartões dos últimos três eventos exibem, em horários apresentados pela interface:
- 18/11/2026 07:44:33: Retorno_Atribuído_LMHub; Pedido adicionado a Assignment Task.
- 18/11/2026 07:45:46: Retorno_LMHub_Retornando; Pedido em devolução ao vendedor; motorista ID101045.
- 18/11/2026 13:53:16: Retorno_LMHub_Em_Espera; Devolução em espera: [Endereço não encontrado]; motorista ID101045.
Status atual visível: Retorno_LMHub_Em_Espera. Nome exibido do motorista: Juliano Santos Pinto (nome omitido das fixtures futuras quando desnecessário).
É uma nova ocorrência, mesmo BR e mesmo motivo textual, com outro motorista e outra data que a ocorrência de16/11 (driver126922). Não substituir dados históricos de recebimentos anteriores pela ocorrência mais recente consultada.
Esta imagem não demonstra recebimento físico posterior à ocorrência de18/11 nem agência do driver101045 nem código AT atual. Não inferir recebimento, criar registro de recebido, ou herdar SPXOWNFLEET do driver126922 com base nela.
Ao confirmar próximo recebimento, associar à ocorrência temporalmente correspondente e buscar transportadora do motorista dessa ocorrência. Reconsulta/enriquecimento de registro histórico deve manter sua identidade de ocorrência.
Nenhum código operacional alterado; atualização documental fornecida para entendimento pelo usuário.
