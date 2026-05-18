# Sabec/Os — sistema operacional do negócio

Repositório privado com a versão canônica do Sabec/Os. Serve como fonte
de verdade pro sistema e como base pra instâncias por cliente: cada
projeto novo nasce de um clone desse repo, customizado pelo `/instalar`.

O Claude Code é o motor. O painel local em `http://localhost:7777`
oferece a operação visual sobre memória, identidade, skills e biblioteca
de conteúdos.

---

## Como usar

```
git clone <url-desse-repo> meu-negocio
cd meu-negocio
code .
```

No VS Code, abrir o terminal integrado e rodar:

```
claude
/instalar
```

O `/instalar` conduz a entrevista de contexto, preenche os arquivos de
memória (`_memoria/empresa.md`, `_memoria/preferencias.md`,
`_memoria/estrategia.md`) e configura o sistema. Roda só uma vez.

### Pré-requisitos

- [Node.js 18+](https://nodejs.org)
- Claude Code autenticado (`claude login`)

---

## Abrindo o painel

Após o `/instalar`, todo uso cotidiano acontece pelo painel local.

- **Windows:** dois cliques em `Abrir sabecOS.bat`
- **macOS:** dois cliques em `Abrir sabecOS.command`

O servidor sobe em `http://localhost:7777` e o navegador abre
automaticamente.

### Setup adicional no macOS

O macOS bloqueia scripts não assinados. Pra liberar o `.command` na
primeira execução:

```
cd "caminho/da/pasta/sabec-os"
chmod +x "Abrir sabecOS.command"
```

Em seguida, clique com o botão direito sobre o arquivo → **Abrir** →
**Abrir mesmo assim**. Depois disso, o duplo clique funciona normalmente.

A renderização de carrosséis usa Playwright, que baixa um Chromium
próprio na primeira execução. As próximas são imediatas.

---

## Skills disponíveis

**Núcleo**

- `/abrir` — carrega o contexto da sessão
- `/salvar` — commit e push no GitHub
- `/atualizar` — varre o projeto e atualiza a memória
- `/novo-projeto` — cria pasta isolada para um cliente ou iniciativa
- `/mapear-rotinas` — identifica tarefas repetitivas e gera skills
  personalizadas

**Conteúdo e SEO**

- `/carrossel` — carrosséis com identidade aplicada em múltiplos formatos
  (4:5, 1:1, 9:16, 16:9, Pinterest, link card)
- `/publicar-tema` — artigo de blog, carrossel e três legendas a partir
  de um tema
- `/seo` — fluxo completo em oito etapas
- `/responder-avaliacoes` — respostas para reviews do Google
- `/aprovar-post` — publicação simultânea em blog, Instagram e Facebook

**Anúncios**

- `/anuncio-google` — campanha em CSV pronto para o Google Ads Editor
- `/relatorio-ads` — relatório semanal a partir dos exports de Google e Meta

**Produção**

- `/analisar-dados` — resumo executivo a partir de CSV, XLSX ou PDF
- `/email-profissional` — rascunho de e-mail a partir de contexto livre

---

## Estrutura

- `_memoria/` — contexto do negócio (empresa, preferências, estratégia)
- `identidade/` — paleta, tipografia, logo e regras visuais
- `marketing/`, `saidas/`, `scripts/` — entregáveis e utilitários
  gerados pelo sistema
- `.claude/skills/` — skills do projeto
- `templates/` — moldes usados por skills e pelo `/instalar`
- `sabec-ui.html` / `sabec-server.mjs` — painel web local
