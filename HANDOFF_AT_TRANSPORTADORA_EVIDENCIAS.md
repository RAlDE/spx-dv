# AT e transportadora: preservar investigação e evitar nova coleta repetida

## Decisão do usuário — 17/11/2026
O usuário informou: "não vou atualizar ainda". A 1.3.72 foi publicada no repositório, mas não deve ser tratada como instalada ou validada na operação. Não publicar novas correções operacionais até concluir a investigação em andamento com o usuário. Não reverter código automaticamente.

O usuário afirma que o processo de localizar a AT e verificar sua transportadora já foi feito anteriormente. A ausência dessa informação nos dois JSONs recentes não prova que a fonte seja desconhecida ou nunca tenha sido validada. Recuperar os registros anteriores antes de pedir nova varredura F12. O usuário se dispõe a refazer a coleta, mas exige registro durável para não repeti-la em outra conversa.

## Evidência anterior já documentada
PROJECT_CONTEXT.md registra, nas seções históricas v1.3.19 e próximas, investigação da AT no rastreio e consulta ao endpoint:
POST /spx_delivery/admin/assignment/assignment_task/search/v2
Payload: {assignment_task_id, pageno:1, count:20, search_type:0}
Campos investigados: assignment_task_id, driver_id, driver_name, agency, agency_id.
A consulta da agência/3PL por AT foi documentada anteriormente. Isso não basta para afirmar que qualquer AT antiga pertence ao ciclo Return atual: recuperar a associação exata que foi validada pelo usuário.

## O que os arquivos recentes demonstram e o que não demonstram
Os dois diagnósticos da 1.3.71 contêm rastreio Return com eventos 119/120 sem número da AT no texto, e buscas de ATs antigas com retcode=0 e lista vazia. Isso comprova apenas a insuficiência dessas consultas, não a inexistência de outra resposta SPX que entregue a AT/agência.
BR265562365941M: recibo Return capturado no arquivo de 16/11.
BR266809938082M: atualização de ocorrência existente com agência vazia no arquivo de 15/11.
Não deduzir transportadora só pelo motorista, nem reutilizar agência de outro ciclo sem vínculo comprovado.

## Registro obrigatório da próxima evidência
Quando o usuário enviar a coleta, antes de encerrar a análise:
1. Registrar tela/ação exata que expõe AT e agência e a sequência para reproduzir.
2. Registrar método, endpoint, parâmetros/payload e caminhos exatos dos campos da resposta.
3. Registrar como BR, ocorrência, motorista, AT e transportadora se relacionam; separar valor comprovado de hipótese.
4. Guardar fixture mínima sanitizada no Git e teste de regressão reproduzível. Não publicar cookies, tokens, cabeçalhos de autenticação nem dados pessoais desnecessários.
5. Registrar o resultado, limitações, versão/commit e apontar este material no PROJECT_CONTEXT.md.
6. Se ainda faltar evidência, indicar exatamente o campo/resposta ausente. Não pedir a investigação inteira novamente.

Arquivos brutos enviados permanecem anexados à conversa; não foram publicados em repositório. Uma descrição genérica "AT verificada" não substitui endpoint, payload, caminhos de campos e fixture.

## Escopo desta atualização
Somente documentação. Nenhuma alteração na extensão, Apps Script, implantação, planilha ou comportamento operacional.
