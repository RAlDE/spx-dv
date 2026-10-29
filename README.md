# SPX-DV

Extensão modular para apoio ao fluxo de recebimento e devoluções no SPX.

## Estrutura

- `extension/`: carregador que deve ser instalado no Chrome.
- `catalog.json`: catálogo remoto controlado por este repositório.
- `launcher/`: página pública com o estado e a versão dos módulos.
- `modules/assistente-de-devolucoes/`: módulo executado na tela de recebimento.
- `owner.json`: identificação administrativa do projeto.

## Instalação para teste

1. Baixe este repositório e extraia os arquivos.
2. Abra `chrome://extensions`.
3. Ative o modo do desenvolvedor.
4. Clique em **Carregar sem compactação** e selecione a pasta `extension`.
5. Nos detalhes da extensão, ative **Permitir scripts de usuário**.
6. Clique no ícone da extensão e ative o Assistente de devoluções.


## Continuidade e manutenção

Antes de qualquer alteração, leia **`PROJECT_CONTEXT.md` diretamente do GitHub**. Ele é a fonte de continuidade do projeto, contém as regras operacionais, endpoints confirmados, arquitetura do Dashboard/planilha, fluxo normal x Return, fonte atual de Bairro e o estado de validação das versões.

Versão atual documentada: **1.3.40**.

Regra de manutenção:
- não misturar este projeto com SPX OnHold;
- buscar sempre os arquivos e SHAs atuais antes de editar;
- manter `assistente.js` e `catalog.json` na mesma versão;
- registrar mudanças relevantes no `PROJECT_CONTEXT.md`;
- validação de sintaxe não equivale a validação real no SPX.

## Publicação

Ative o GitHub Pages para a branch `main`, pasta raiz. O catálogo e os scripts
continuam sendo servidos pelo `raw.githubusercontent.com` e não armazenam
senhas, cookies ou tokens.

## Segurança

O módulo usa somente a sessão já autenticada no SPX. O acesso operacional é
validado pelo e-mail corporativo e pelas permissões `RESOLVE_EO` e
`CANCEL_EO_REASON`. A extensão não cria nem amplia permissões corporativas.
