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
