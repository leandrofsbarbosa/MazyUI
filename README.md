# MazyUI — Painel local pra operar negócio via Claude Code

> Roda 100% local, navegador como interface, Claude Code como motor.

## O que faz

Painel web local rodando em `http://localhost:7777`:

- **Painel inicial** com foco do dia, prioridades, ações rápidas
- **Editor de memória e identidade** direto no navegador
- **Catálogo de skills** com modais de execução
- **Biblioteca de conteúdos** com preview de carrosséis
- **Edição de slides individuais** com proteção contra reescrita acidental dos irmãos
- **Reinício do servidor** e **fechamento do painel** com um clique

Tudo roda local — nenhum dado sai da máquina além das chamadas que o Claude Code já faz.

## Instalação

```bash
git clone https://github.com/DiogoSabec/MazyUI.git
cd MazyUI
```

Depois:
- **macOS:** dois cliques em `Abrir MazyUI.command`
- **Windows:** dois cliques em `Abrir MazyUI.bat`

Pré-requisitos:
- [Node.js 18+](https://nodejs.org)
- Claude Code autenticado (`claude login`)

No macOS, na primeira execução, libera o script:
```bash
chmod +x "Abrir MazyUI.command"
```

## Customizar a marca pra ti

O sistema usa `brand.config.js` pra controlar nome, autores, título, etc. Edita esse arquivo pra rebrandear pro teu negócio.

## Skills disponíveis

`/abrir`, `/salvar`, `/atualizar`, `/novo-projeto`, `/mapear-rotinas`, `/carrossel`, `/publicar-tema`, `/seo`, `/responder-avaliacoes`, `/aprovar-post`, `/anuncio-google`, `/relatorio-ads`, `/analisar-dados`, `/email-profissional`, `/instalar` — detalhes em `.claude/skills/`.
