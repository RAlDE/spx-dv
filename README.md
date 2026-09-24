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

## Publicação

Ative o GitHub Pages para a branch `main`, pasta raiz. O catálogo e os scripts
continuam sendo servidos pelo `raw.githubusercontent.com` e não armazenam
senhas, cookies ou tokens.

## Segurança

O módulo usa somente a sessão já autenticada no SPX. O acesso operacional é
validado pelo e-mail corporativo e pelas permissões `RESOLVE_EO` e
`CANCEL_EO_REASON`. A extensão não cria nem amplia permissões corporativas.
