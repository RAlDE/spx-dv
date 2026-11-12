# SPX-DV 1.3.71 — diagnóstico e filtros somente

Base: main 0f98204. Não inclui as correções de Return/duplicidade do PR #1 (1.3.70).

## Alterações
- D e I: botão Baixar diagnóstico exporta JSON com as respostas completas observadas de tracking_info, recipient_info, order_info, recebimento uni_receive, EHA e busca de Assignment Task; inclui diagnósticos D/I existentes.
- Coleta passiva: não dispara consultas. EHA observado não confirma recebimento e não entra na fila operacional.
- Buffer local: últimas 40 respostas, até 1.500.000 caracteres; resposta individual acima de 500.000 caracteres é omitida com indicação. Contador dropped informa descarte. Exportar logo após o caso. O arquivo pode conter outros BRs e dados operacionais/pessoais dessas respostas; não inclui cabeçalhos/cookies.
- Dashboard: filtros e contagens acompanham outros filtros, busca, data e ocultação. Mantém seleção sem resultados para permitir limpar.
- Servidor preserva build/protocolo 1.3.68 para compatibilidade; módulo diagnóstico 1.3.71. Só JavaScript de filtros no HTML foi alterado no .gs. Escrita em Dados, coluna G, controle, confirmação e envio em massa intactos.

## Instalação de teste
O ZIP de teste contém extensão independente com scripts locais desta revisão, sem depender de main. Desative a extensão SPX-DV anterior antes de carregar a pasta extension deste ZIP em chrome://extensions (modo desenvolvedor > Carregar sem compactação). Ative Permitir scripts de usuário nos detalhes e o módulo no popup. Recarregue as abas SPX antes do próximo recebimento. Confirme v1.3.71.
Para filtros: substituir o código pelo arquivo apps-script/recebimento-onhold-dados.gs e atualizar a implantação existente (Gerenciar implantações > editar > Nova versão > Implantar), preservando a URL. Reabrir o Dashboard. Esta tarefa não atualizou a implantação Google.

## Teste real
Receber um pacote normalmente; consultar esse mesmo BR na caixa para observar o rastreio; D ou I > Baixar diagnóstico. Enviar JSON e BR problemático. O botão Copiar antigo continua resumido. O diagnóstico não recupera respostas que passaram antes da instalação. Para Return, coletar um exemplo Return além do exemplo LMHub.

## Verificação
node tests/diagnostico-filtros.cjs: filtros em 1.200 linhas simuladas; fetch/XHR, 100 eventos de rastreio preservados, buffer limitado, domínio externo ignorado, EHA não publica recibo e uni_receive mantém publicação. Verificação de sintaxe JS/GS e diff. Ainda requer teste real no SPX.
