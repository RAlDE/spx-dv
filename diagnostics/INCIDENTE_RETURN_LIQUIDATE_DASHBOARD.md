# Return convertido para Liquidate sem entrada no Dashboard

Relato do usuário em18/11/2026: pacote já em retorno/devolução ao vendedor, com ocorrências que indicariam encaminhar ao SOC, muda para Liquidate no SPX durante o recebimento e não aparece no Dashboard.

Pedido explícito: manter os diagnósticos D e I na caixa. Presentes na versão1.3.73 publicada. Não remover durante correções.

Ainda faltam BR, horário, resposta do recebimento e eventos desse caso. Não há causa demonstrada. Possibilidades a investigar, sem tratá-las como conclusão: outro endpoint de recebimento/transição, resposta diferente, falha do hook, perda da ocorrência na mudança de ciclo, rejeição/enriquecimento/fila central.

Próxima captura: usar a versão atual, manter a página de recebimento aberta no momento do caso e exportar Baixar diagnóstico pelo D ou I imediatamente após a transição, antes de recarregar/limpar. Anotar BR, hora e confirmar se o recebimento foi concluído no SPX. Não repetir recebimento apenas para capturar diagnóstico. Buffer limitado: captura pode não conter tráfego anterior ou endpoints não monitorados. Se insuficiente, ampliar de forma pontual após verificar o arquivo; não afirmar que todo endpoint Liquidate já é registrado.

Regras preservadas: status Liquidate sozinho não comprova recebimento nem autoriza inserir histórico. Investigar reconhecimento do recibo real e preservação da ocorrência correspondente. Não alterar envio em massa ou planilha para compensar uma lacuna de captura. Nenhuma correção operacional realizada neste registro.
