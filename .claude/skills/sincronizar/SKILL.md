---
name: sincronizar
description: >
  Fecha o ciclo de desenvolvimento do MazyUI: commita mudanças locais
  no sabec-os, pusha pro origin, roda o sync-to-mazyui.sh, e commita+pusha
  o espelho público MazyUI. Roda APENAS do diretório do sabec-os.
  Use quando o usuário rodar `/sincronizar` ou pedir "sincroniza tudo",
  "propaga as mudanças", "pusha pro mazyui também", "fecha o ciclo".
---

# /sincronizar — Propaga mudanças sabec-os → MazyUI público

Esse comando faz a ponte entre o desenvolvimento no sabec-os privado e
o espelho público MazyUI. Em uma chamada: commit + push aqui, sync
automático, commit + push lá. Cliente NÃO é sincronizado por esse
comando — cada cliente puxa o update pelo `/atualizar-sistema` na pasta
do próprio cliente.

## Pré-checagem

### 1. Estamos no sabec-os?

Conferir com:

```bash
test -f sync-to-mazyui.sh && grep -q '"name": "sabec-os"' package.json
```

Se falhar, parar e avisar:
> "O `/sincronizar` roda só do diretório do sabec-os
> (~/Documents/Empresas/Original/SabecOS). Aqui parece ser outro
> projeto. Se quer fazer commit+push do projeto atual, usa `/salvar`."

### 2. Estado do git no sabec-os

Rodar `git status --porcelain`. Três cenários:

**A. Sem mudanças locais:**
> "Nada pra commitar aqui no sabec-os. Quer rodar só o sync-to-mazyui.sh
> pra garantir que o MazyUI tá alinhado com o último commit (`<hash>`)?"

Se sim, pular direto pra Fase 2. Se não, encerrar.

**B. Tem mudanças locais:**
Mostrar o resumo:
```bash
git diff --stat
git status --short
```

Perguntar:
> "Que mensagem quer pra esse commit? (Vou usar como `git commit -m`
> e também derivar a mensagem do sync no MazyUI a partir do hash.)"

**C. Merge ou rebase em andamento** (existe `.git/MERGE_HEAD` ou `.git/rebase-*`):
> "Tem merge/rebase em andamento. Resolve antes de sincronizar."

Parar. Não tenta resolver automaticamente.

### 3. Working tree do MazyUI existe?

Conferir:
```bash
test -d "${MAZYUI_PATH:-$HOME/Documents/Empresas/Original/MazyUI}/.git"
```

Se não, avisar e parar antes mesmo de commitar o sabec-os — não tem
sentido commitar localmente sabendo que o sync vai falhar:
> "Working tree do MazyUI não encontrada em
> `~/Documents/Empresas/Original/MazyUI`. Clona primeiro com:
> `git clone https://github.com/DiogoSabec/MazyUI.git ~/Documents/Empresas/Original/MazyUI`
> ou aponta pra outro path: `export MAZYUI_PATH=/caminho/outro`."

### 4. MazyUI sem mudanças órfãs

No diretório do MazyUI, rodar `git status --porcelain`. Se tiver
mudanças NÃO vindas de um sync anterior (ou seja, qualquer coisa
diferente de arquivos que o sync-to-mazyui.sh costuma alterar), avisar:

> "O MazyUI tem mudanças não-commitadas:
> [git status do MazyUI]
>
> Posso prosseguir? O sync vai stage essas mudanças junto com as do
> sync no commit final."

Confirmar com o usuário antes de seguir.

---

## Fase 1 — Commit + push no sabec-os

Apenas se houver mudanças locais (caso B). Com a mensagem confirmada:

```bash
git add -A
git commit -m "<mensagem>"
git push origin main
```

Capturar o hash curto:
```bash
SABEC_HASH=$(git rev-parse --short HEAD)
```

Se `git push` falhar (sem rede, fork divergiu, conflito), parar e
reportar. NÃO força nem rebase. O commit local fica feito; o usuário
resolve manualmente e pode rerodar `/sincronizar` que vai apenas
pushar (sem novo commit, porque já tá commitado).

---

## Fase 2 — Sync pro MazyUI

```bash
./sync-to-mazyui.sh
```

Mostrar a saída pro usuário. Três resultados possíveis:

1. **Script falhou** (working tree sumiu, erro de I/O):
   Reportar o erro literal. Encerrar. O sabec-os já tá pushed —
   apenas o MazyUI ficou atrás.

2. **"Nada mudou"** — o MazyUI já estava em sync com o HEAD do
   sabec-os. Reportar e encerrar com sucesso.

3. **Sync gerou diff staged** — continuar pra Fase 3.

---

## Fase 3 — Commit + push no MazyUI

```bash
cd "${MAZYUI_PATH:-$HOME/Documents/Empresas/Original/MazyUI}"
git commit -m "sync: from sabec-os $SABEC_HASH"
git push origin main
```

Capturar o hash do MazyUI:
```bash
MAZYUI_HASH=$(git rev-parse --short HEAD)
```

Se algum dos comandos falhar, reportar o erro literal. Não tentar
forçar push.

---

## Fase 4 — Resumo final

Quando tudo der certo:

```
✅ sabec-os: <SABEC_HASH> em DiogoSabec/sabec-os (privado)
✅ MazyUI:   <MAZYUI_HASH> em DiogoSabec/MazyUI (público)

Os clientes não foram atualizados — quando quiseres, abre o Claude
Code dentro de cada pasta de cliente e roda /atualizar-sistema.
```

Quando o push do MazyUI falhar mas o sabec-os deu certo:

```
✅ sabec-os: <SABEC_HASH> em DiogoSabec/sabec-os (privado)
❌ MazyUI: sync localmente OK, push falhou — <erro>

Pra retomar manualmente:
  cd ~/Documents/Empresas/Original/MazyUI
  git push origin main
```

---

## Edge cases

- **Token gh expirou:** push HTTP falha com 401/403. Reportar e
  sugerir `gh auth login --web`.
- **Conflito de merge no MazyUI:** improvável porque o sync sobrescreve,
  mas se rolar, reportar e pedir resolução manual.
- **brand.config.js modificado no MazyUI por engano:** o sync vai
  sobrescrever as mudanças do server/UI etc. mas o `.gitattributes
  merge=ours` só age em git merges, não em copy direto. Se o usuário
  tinha brand customizado e o sync apaga, reportar — mas isso indica
  bug no script, não erro de uso.

---

## Não confundir com

| Skill | O que faz |
|---|---|
| `/sincronizar` | Aqui — sabec-os → MazyUI. Roda só do sabec-os |
| `/salvar` | Commit+push simples no repo atual. Funciona em qualquer projeto |
| `/atualizar-sistema` | Cliente puxa updates do sabec-os. Roda em cliente, não no sabec-os |
