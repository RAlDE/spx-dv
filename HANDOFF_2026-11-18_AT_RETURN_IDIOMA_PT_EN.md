# HANDOFF — descoberta da AT de Return no rastreio em português vs. inglês

**Investigação:** 18/11/2026, capturas subsequentes fornecidas pelo usuário no SPX. **Projeto primário:** `RAlDE/spx-dv`; referência cruzada: `RAlDE/spx-onhold`. **Estado:** evidências confirmadas + hipótese a testar. **Sem alteração de código nesta documentação.**

## Para retomar em outra conversa (LEIA PRIMEIRO)

1. **ATUALIZAÇÃO DE TESTE REAL:** Com a tela em português e `spx-admin-lang=en` + `spx-lang=en`, consulta `tracking_info` feita no Console retornou HTTP 200 e `AT20261118D0T4N` em inglês nos eventos 119/120. O efeito conjunto está confirmado; **qual cookie isolado controla o idioma ainda não foi testado**. Leia seção 'Teste real conclusivo' no final.
2. **Fato confirmado:** a resposta do MESMO endpoint `GET /api/fleet_order/order/detail/tracking_info?shipment_id=BR2659468678763` é localizada conforme idioma do SPX. Na resposta pt-BR, os eventos 119/120 mencionam Assignment Task mas omitem seu ID; na resposta en, ambos incluem `AT20261118D0T4N` na propriedade `message`.
2. **Fato confirmado:** `Accept-Language` do navegador continua `pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7` nos dois estados de idioma observados. No teste via Console, enviar apenas `Accept-Language: en-US,en;q=0.9` com a interface/sessão pt-BR NÃO alterou a resposta: ambos os testes retornaram mensagens em português, HTTP 200, AT ausente.
3. **Fato confirmado:** os cookies de preferência de idioma mudam conforme o seletor do SPX: inglês `spx-admin-lang=en` e `spx-lang=en`; português `spx-admin-lang=pt-br` e `spx-lang=pt-BR`. O cookie separado `language=pt-BR` permaneceu igual nos dois exemplos. Isso aponta para uma hipótese plausível, **NÃO demonstra** qual cookie controla a resposta.
4. **Próxima etapa pendente:** experimento controlado que isole o efeito de `spx-admin-lang` e `spx-lang` sobre `tracking_info`, mantendo a interface em português. Não afirmar que mudar cookie funciona antes de prova real. Planejar com segurança e restauração de estado, sem compartilhar credenciais.
5. **Não editar módulos ainda por esta hipótese.** Caso confirmada, avaliar recuperação localizada da AT para o SPX-DV sem alterar globalmente a preferência do SPX; cuidado com cookies de escopo de sessão e concorrência. Alternativa comprovada: cadeia BR → VTs de conferência → AT → agência já documentada em `diagnostics/EVIDENCIA_CONFERENCIA_AT_BR262413570263G.md`.

## Evidência direta: comparação de `tracking_info` do mesmo BR

- Arquivos enviados pelo usuário na conversa: `Texto colado(1).txt` (resposta em português) e `Texto colado(2).txt` (resposta em inglês). Outras evidências: vídeos de troca de idioma do SPX e capturas F12 das requisições e dos testes no Console.
- O par de respostas do mesmo `shipment_id` teve `retcode=0` e `display_status=125`; o BR já estava com estado exibido de devolvido/returned. Este exemplo **serve para descobrir a AT histórica do Return**, não para classificá-lo como ocorrência ou rota atual.
- Ambos os JSONs têm os mesmos eventos por `id` e `timestamp`; a informação de AT aparece exclusivamente no texto inglês das mensagens 119/120. Não foi identificado um campo `assignment_task_id` específico nesses dois eventos. Não procurar somente por status 10 nem por toda ocorrência histórica.

| Campo | Português | Inglês |
|---|---|---|
| `shipment_id` | `BR2659468678763` | `BR2659468678763` |
| Evento `id=131977011`, `status=119`, `timestamp=1794968376` | `Adicionando pedido a Assignment Task` | `Parcel adding into Assignment Task AT20261118D0T4N` |
| Evento `id=132067156`, `status=120`, `timestamp=1794994012` | `Pedido adicionado a Assignment Task` | `Parcel added into Assignment Task AT20261118D0T4N` |
| Evento `status=124` | `Pedido em devolução ao vendedor` | `Parcel returning to seller` |
| Evento `status=125` | `Pedido devolvido` | `Parcel returned` |

**AT extraída da fonte inglesa:** `AT20261118D0T4N`. É prova de associação ao evento de atribuição do BR na data e instante desses eventos, **não** licença para ligar essa AT a toda ocorrência histórica anterior/posterior, ou para presumir a transportadora de outro motorista.

## Evidência F12: seleção de idioma e cabeçalhos

- Request URL e método idênticos nos testes visuais PT e EN; ambas requisições GET receberam HTTP 200.
- `Accept-Language` permaneceu `pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7` em ambas.
- Cabeçalhos de idioma visíveis não mostraram diferença relevante; a diferença observada foi nos seguintes **cookies não secretos de preferência de idioma**:

| Nome do cookie | PT (SPX em português) | EN (SPX em inglês) |
|---|---|---|
| `spx-admin-lang` | `pt-br` | `en` |
| `spx-lang` | `pt-BR` | `en` |
| `language` | `pt-BR` | `pt-BR` |

**Conclusão fundamentada:** os dois cookies `spx-*` variam junto com a preferência da interface e são candidatos a controlar a localização da resposta. Não foram testados isoladamente, portanto ainda não há demonstração de causalidade. Outros estados/contextos também podem influenciar.

### Teste de Console já realizado (NÃO repetir sem nova finalidade)

- Com o SPX em português, duas chamadas `fetch()` ao endpoint `tracking_info` com `credentials: 'include'`, `cache: 'no-store'`:
  1. Com headers padrão: eventos 119/120 em português, AT ausente; HTTP 200.
  2. Com `Accept-Language: en-US,en;q=0.9`: eventos 119/120 ainda em português, AT ausente; HTTP 200.
- Logo, sobrescrever somente `Accept-Language` não resolveu. O browser não permite sobrescrever arbitrariamente o cabeçalho proibido `Cookie` em `fetch`; não propor `headers: { Cookie: ... }` como solução.

## Relação com projetos e decisões anteriores

- O **SPX OnHold v0.3.28** foi validado pelo usuário no SPX real em inglês (18/11/2026). A versão corrigiu a leitura de cabeçalhos `Assignment Task ID`, `Driver`, `Action` e do campo `SPX Tracking Num`, mantendo compatibilidade pt-BR. Não alterar esta compatibilidade para resolver a fonte do rastreio.
- O **SPX-DV** tinha o parser `assignmentTaskId(message)` para extrair `AT...` de mensagens em inglês e caminhos alternativos de conferência; com resposta PT sem AT na mensagem, o parser sozinho não consegue inventar o ID.
- No SPX-DV, o vínculo da agência/transportadora deve ser específico à ocorrência e ao motorista e respeitar horários. O fluxo BR → VT → AT → agência já tem endpoints confirmados: `GET /api/in-station/lmhub/audit/task/list?shipment_id={BR}...`, `GET /api/in-station/lmhub/audit/target/list?shipment_id={BR}&task_id={VT}...`, `POST /spx_delivery/admin/assignment/assignment_task/search/v2` com match exato da AT. Detalhes e limites: `diagnostics/EVIDENCIA_CONFERENCIA_AT_BR262413570263G.md` e `HANDOFF_2026-11-18_RETURN_AGENCIA_1.3.73.md`.
- O status atual do BR Return não é determinado pela mera presença de eventos antigos; OnHold distingue `Return_LMHub_Returning` (Em rota) de `Return_LMHub_Onhold` (Ocorrências). Este registro do idioma NÃO modifica regras de status nem contagens.
- No momento desta documentação, catálogos consultados: **SPX-DV 1.3.78** e **SPX OnHold 0.3.28**; confirmar novamente SHA e versão antes de qualquer alteração futura. Seções antigas de `PROJECT_CONTEXT.md` citam versões históricas: não usá-las para sobrescrever versões atuais.

## Próximas verificações seguras

1. Projetar teste isolado dos dois cookies de idioma, um de cada vez, com retorno imediato aos valores originais e sem recarregar ou comprometer a operação. Preferir ambiente autorizado/temporário. Provar se o endpoint devolve `AT...` com a interface em português; registrar a combinação exata, sem valores de autenticação.
2. Se o endpoint produzir AT em inglês, avaliar método que preserve a preferência global do operador, evite condições de corrida entre chamadas e nunca ative recebimento ou outras operações. Alternativamente, preferir fonte estruturada já documentada via conferência.
3. Testar com BR Return com múltiplas ATs/ocorrências: correlacionar `event.id`, `timestamp`, `AT` e `driver_id` da mesma ocorrência; impedir herança de AT posterior/driver divergente.
4. Antes de programar, seguir o processo de GitHub: conferir base atual, alterar somente o projeto autorizado, preservar funcionalidades reais testadas, atualizar documentação e indicar que teste local não prova operação real.

## Segurança e procedência

- O usuário enviou Headers completos em duas capturas textuais, contendo cookies/tokens de sessão, identificadores e cabeçalhos de assinatura. **Nenhuma credencial, valor de sessão, JWT, assinatura, nome de operador ou dump bruto foi reproduzido neste GitHub.** Só constam os nomes e os valores não autenticadores de idioma necessários à descoberta.
- Tratar as credenciais compartilhadas na conversa como potencialmente expostas: orientar usuário a invalidar/renovar a sessão pela TI e não solicitar novamente `Cookie`, `Authorization`, `csrftoken`, `x-sap-*`, `fms_user_skey` ou `spx_uk`.
- As respostas e vídeos originais são evidência **fornecida pelo usuário** na conversa; não estão armazenados neste repositório. Este handoff contém apenas um recorte sanitizado e verificável.

## Diário de investigação contínua

- **18/11/2026 — descoberta e comparação completas:** par de respostas PT/EN, eventos 119/120, AT extraída em inglês, teste `Accept-Language` negativo, descoberta dos cookies `spx-admin-lang` e `spx-lang` como hipótese não confirmada. Registro documental apenas; nenhum código, catálogo, integração de Sheets ou estado da sessão alterado por este trabalho.
- **Próximo registro:** acrescentar neste arquivo resultado controlado de cada cookie (com sucesso/fracasso), detalhes mínimos sem segredos, limitações, decisão técnica, commit e validação real quando houver.


## Teste real conclusivo — cookies de idioma em inglês sem mudar a interface

**Data:** 18/11/2026 (sessão local; captura enviada depois da comparação de headers). **Fonte:** imagem do Console do Chrome na página de rastreio do mesmo BR. **Ambiente:** SPX real.

**Resultado confirmado:** o usuário manteve a interface visível do SPX em **português** e mostrou na aba Application os cookies `spx-admin-lang=en` e `spx-lang=en`. Em seguida executou, na mesma página e sem recarregar, uma chamada GET autenticada com `fetch('/api/fleet_order/order/detail/tracking_info?shipment_id=BR2659468678763', { credentials:'include', cache:'no-store' })` no Console. O Console exibiu `HTTP: 200` e a tabela confirmou:

| Status | Resposta em inglês | AT extraída |
|---|---|---|
| 119 | `Parcel adding into Assignment Task AT20261118D0T4N` | `AT20261118D0T4N` |
| 120 | `Parcel added into Assignment Task AT20261118D0T4N` | `AT20261118D0T4N` |

**Conclusão atualizada:** está **validado em ambiente real** que, com a página do SPX ainda visível em português, a requisição `tracking_info` pode retornar mensagens em inglês incluindo a AT, quando os DOIS cookies de preferência de idioma estão em `en`. O teste anterior, que apenas enviava `Accept-Language: en-US,en;q=0.9` com a sessão pt-BR, retornou português sem AT.

**Limites importantes:** os dois cookies foram alterados conjuntamente; não foi isolado qual deles é necessário/suficiente. O teste não prova que uma extensão possa impor idioma `en` em apenas UMA requisição sem tocar no estado da sessão, tampouco garante comportamento idêntico para outros endpoints ou usuários. A tela permanecer visualmente em português **até aquela captura** não demonstra que uma recarga após alterar cookies continuaria em português. A observação de `HTTP 200` e ID de AT não autoriza associar esta AT automaticamente a toda ocorrência de Return.

**Próxima decisão técnica:** encontrar mecanismo seguro de consulta *isolada* em inglês (ou preferir o vínculo estruturado BR → VT → AT já validado) sem mudar globalmente cookies/sessão do operador, sem interferir no SPX e sem vazamento de AT entre ciclos. Registrar testes de isolamento por cookie apenas se necessários, preferindo sessão de teste autorizada. Antes de qualquer implementação, exigir confirmação do usuário e verificar o código/versão atual no GitHub.

**Restauração:** orientar operador a restaurar os cookies `spx-admin-lang=pt-br` e `spx-lang=pt-BR` após o experimento. **Segurança:** não publicar nem solicitar cookies de autenticação, tokens, IDs de sessão ou headers de assinatura. Este registro contém somente os valores de idioma não autenticadores; a captura original permanece na conversa.

**Estado de publicação desta investigação:** documentação apenas; código, catálogo, lógica Return, recebimento, dashboard e Apps Script não alterados. No registro, versões de catálogo SPX-DV `1.3.78` e OnHold `0.3.28`.
