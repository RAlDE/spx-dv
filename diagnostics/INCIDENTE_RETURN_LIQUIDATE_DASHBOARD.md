# Return convertido para Liquidate sem entrada no Dashboard

Relato esclarecido pelo usuário em 18/11/2026: pacote já em retorno/devolução ao vendedor muda para Liquidate NO RECEBIMENTO quando tem três ocorrências válidas OU motivo Rejeitado pelo comprador OU motivo Mudança de endereço. Nesse cenário não aparece no Dashboard. Não é uma conversão genérica de qualquer Return recebido.

Condições relatadas são alternativas, não cumulativas. A regra histórica do projeto conta os três dias distintos com motivos válidos; a expressão “3 ocorrências válidas” neste esclarecimento não autoriza mudar essa contagem para três registros no mesmo dia. Conferir os eventos reais antes de atribuir comportamento ao SPX. Este documento descreve o cenário relatado, não uma causa técnica já comprovada.

Pedido explícito: manter os diagnósticos D e I na caixa. Presentes na versão1.3.73 publicada. Não remover durante correções.

Ainda faltam BR, horário, resposta do recebimento e eventos desse caso. Não há causa demonstrada. Possibilidades a investigar, sem tratá-las como conclusão: outro endpoint de recebimento/transição, resposta diferente, falha do hook, perda da ocorrência na mudança de ciclo, rejeição/enriquecimento/fila central.

Próxima captura: usar a versão atual, manter a página de recebimento aberta no momento do caso e exportar Baixar diagnóstico pelo D ou I imediatamente após a transição, antes de recarregar/limpar. Anotar BR, hora e confirmar se o recebimento foi concluído no SPX. Não repetir recebimento apenas para capturar diagnóstico. Buffer limitado: captura pode não conter tráfego anterior ou endpoints não monitorados. Se insuficiente, ampliar de forma pontual após verificar o arquivo; não afirmar que todo endpoint Liquidate já é registrado.

Regras preservadas: status Liquidate sozinho não comprova recebimento nem autoriza inserir histórico. Investigar reconhecimento do recibo real e preservação da ocorrência correspondente. Não alterar envio em massa ou planilha para compensar uma lacuna de captura. Nenhuma correção operacional realizada neste registro.
