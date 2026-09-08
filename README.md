# Vila RP v0.3 — Mundo Online

Protótipo jogável em HTML/CSS/JavaScript para GitHub Pages + Firebase.

## O que mudou nesta versão

- O mundo **abre antes do Firebase**. Uma falha de conexão não deixa mais o jogador preso na tela de login.
- Firebase fica em segundo plano para presença, chat e edições do mundo.
- Mundo procedural por chunks, com 8 regiões/biomas.
- Dia/noite com iluminação, estrelas e mudança de céu.
- Terreno profundo com pedra, ardósia e bedrock na última camada.
- Minérios: carvão, ferro, ouro, diamante e esmeralda.
- Água e lava com simulação celular leve.
- Mundo destrutível e blocos colocáveis.
- Inventário de 32 slots e hotbar de 8 slots.
- Crafting rápido.
- Mobs noturnos: slime, zumbi e morcego.
- Vida, dano, respawn e combate simples.
- Multiplayer de presença em tempo real.
- Chat global.
- Salvamento local para não perder a posição quando o Firebase estiver indisponível.
- Controles PC e mobile.

## Firebase

A configuração do projeto está em `js/firebase.js`.

### Authentication

Para contas com nome + senha, ative no Firebase Authentication:

**Authentication → Método de login → E-mail/senha → Ativar**

O login anônimo também deve permanecer ativado.

### Realtime Database

Use o conteúdo de `firebase-rtdb-rules.json` em:

**Realtime Database → Regras**

As regras desta versão não deixam o banco totalmente público para escrita.

## GitHub Pages

Suba os arquivos mantendo esta estrutura:

```text
index.html
style.css
firebase-rtdb-rules.json
README.md
js/firebase.js
js/main.js
```

Depois abra o endereço do GitHub Pages. Não abra `index.html` com `file://`, porque módulos ES e Firebase podem ser bloqueados pelo navegador.
