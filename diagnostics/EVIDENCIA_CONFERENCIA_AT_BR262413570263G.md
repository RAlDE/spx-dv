# Fonte visual de BR → AT → agência
Evidência fornecida em 17/11/2026: vídeo 20261118-0126-25.0276792.mp4 e imagem image(20261118-013303).png. Inspeção de quadros do vídeo e imagem, sem captura de resposta Network nesta etapa.

## Caminho observado
1. Gestão Audit → Conferência: LM Hub AT/TO, pesquisa pelo SPX TN BR262413570263G.
2. Detalhe VT na rota /#/mercadao/audit-list/vt-detail?vt-task-id=VT202611170NMF4.
3. Campo SPX TN preenchido com BR262413570263G; resultado único na coluna AT/TO: AT20261117CZ0NV, corredor H-15, Validado. Totais inicial104, final99, bipado101, classificado incorretamente2, faltante5.
4. Visualizar abre detalhe AT/TO da conferência.
5. Entrega → Atribuição de Entrega, rota /#/delivery-assignment/list: consulta ID da AT AT20261117CZ0NV retorna uma linha, station5459 LM Hub_SC_Itajaí_Espinheiros, Sentido General, corredor H-15, Agência(3PL) SPXOWNFLEET, cidade Itajaí.

## Conclusão e limite
Há fonte visual útil de associação da pesquisa BR com uma AT na conferência e da AT com agência. Não é necessário depender apenas do código AT na mensagem do rastreio.
A AT observada é de 17/11. NÃO comprova a agência da ocorrência de 16/11 09:45:17 (driver126922). É necessário preservar o vínculo temporal; não substituir automaticamente o dado histórico pela atribuição posterior.
Ainda faltam endpoints/payloads/campos JSON da busca da conferência e confirmação do vínculo BR dentro da AT. F12 estava em Elements, portanto esses detalhes não foram demonstrados pelo vídeo.
Próxima coleta: Network → Fetch/XHR na tela Detalhe VT, repetir Procurar com o BR já preenchido; identificar requisição que retorna AT20261117CZ0NV e coletar URL, payload e response. Em seguida capturar consulta por AT em Atribuição de Entrega se necessário.
Nenhum código operacional alterado.
