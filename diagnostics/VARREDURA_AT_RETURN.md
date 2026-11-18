# Varredura F12: onde estão AT e transportadora Return

Ferramenta: varredura-at-return-f12.js. Não atualiza extensão/Apps Script. Não consulta APIs, não confirma recebimentos, não reenvia registros. Instala observadores temporários fetch/XHR na aba e examina campos DOM e scripts application/json ao comando.

## Executar
1. Abra o SPX e, antes de pesquisar o BR Return, abra F12 > Console.
2. Copie o Raw completo de diagnostics/varredura-at-return-f12.js, execute no Console e informe o BR.
3. Confirme a caixa Varredura AT no canto inferior direito. Pesquise o BR nessa mesma aba e abra os detalhes e abas internas com dados de devolução/atribuição. O coletor só observa respostas que a página normalmente carrega.
4. Clique Examinar página, depois Baixar varredura. Envie o JSON e diga qual tela/aba abriu, especialmente se enxergar agência ou AT.
5. Parar restaura os observadores quando ainda pertencem ao coletor. Uma recarga remove o coletor e os dados em memória; baixe antes de recarregar. Em outra aba, execute novamente.

## O que é preservado
Para cada resposta: endpoint sem query bruta, método, HTTP status, horários, campos relevantes da requisição/query e caminhos exatos de campos candidatos na resposta (ex.: $.data.list.0.assignment_task_id e $.data.list.0.agency). Candidatos por regex de códigos AT/BR e nomes de campos assignment/agency/3pl/carrier/fleet/driver/shipment. A origem DOM inclui tag/id/name/índice e indicação de oculto. Candidatos não provam vínculo: podem pertencer a outro BR ou configurações. Validar pela cadeia BR/ocorrência/AT/motorista/agência antes de corrigir produção.

## Limites
Até 150 respostas; contador dropped; JSON até 3 milhões de caracteres; 60 mil campos e 500 achados por resposta; até 15 mil nós DOM e 500 achados DOM. Não lê heap interno de frameworks, tráfego anterior à instalação, cabeçalhos/cookies, iframes externos, service workers ou respostas binárias. Alguns fetch via Request sem init.body não têm payload coletado. Chaves com token/secret/password/cookie/auth/session/signature são ignoradas. Nomes de motoristas e códigos operacionais podem permanecer no arquivo; não publicar o JSON bruto no Git.

## Registro do resultado
Depois da coleta, salvar neste diretório um mapa de evidências: tela e ação, endpoint, payload mínimo sanitizado, caminhos exatos de BR/AT/agência, regra de associação validada, fixture sanitizada e teste. Este documento é o procedimento; ainda não afirma onde a AT Return estará.

Validação: node tests/at-scan.cjs passou em simulação fetch/XHR, sem chamadas adicionais, preservação de resposta e restauração. A descoberta real depende da execução na página SPX.
