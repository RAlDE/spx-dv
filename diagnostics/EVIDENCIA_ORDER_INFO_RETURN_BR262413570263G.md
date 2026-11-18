# Varredura real F12 — order_info Return

Resposta fornecida pelo usuário nesta conversa, via Network > Fetch/XHR > order_info?shipment_id=BR262413570263G > Copy response. Tela: Informações do pedido, BR262413570263G, rótulo Retorno_Recebido_LMHub. Endpoint conhecido do módulo: GET /api/fleet_order/order/detail/order_info?shipment_id=BR262413570263G.

Resultado desta resposta: retcode=0. Não há campo assignment_task_id, at_id, agency/agency_id nem transportadora identificada. Não repetir essa coleta para este mesmo caso sem motivo novo.

Campos observados:
- $.data.basic_info.shipment_id = BR262413570263G
- $.data.basic_info.status = 10
- $.data.basic_info.order_flow = 2
- $.data.basic_info.current_station_id = 5459
- $.data.basic_info.current_station_name = LM Hub_SC_Itajaí_Espinheiros
- $.data.basic_info.third_party_channel_name = vazio
- $.data.return_info.return_station_id = 5459
- $.data.return_info.return_station_name = LM Hub_SC_Itajaí_Espinheiros
- $.data.return_info.return_sp_station_name = Maicon Rebello ME
- $.data.return_info.return_driver_zone_name = vazio
- $.data.return_info.return_sort_code = SOC-PR1--HUB-LSC-15

Maicon Rebello ME aparece como estação/ponto de retorno, não como agência comprovada da AT. As rotas origin_order_path/return_order_path são listas de estações e não identificam AT. sensitive_permission lista campos pessoais/financeiros; não há AT/agência na lista de campos ocultados apresentada. Isso não demonstra ausência de AT em outras respostas ou no estado da página.

Próximo passo específico: examinar a resposta reallocation_history do mesmo BR, já observada na lista Network; em seguida decidir a próxima fonte conforme conteúdo. Não alterar captura, Dashboard, Dados nem transportadora com base nesta resposta isolada.
