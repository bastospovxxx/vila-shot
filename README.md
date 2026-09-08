# Vila RP v0.4

Versão corrigida para GitHub Pages.

## IMPORTANTE
Os arquivos deste pacote estão na RAIZ. Não coloque a pasta inteira dentro de outra pasta se o GitHub Pages estiver apontando para a raiz do repositório.

A página abre primeiro o mundo local e tenta conectar ao Firebase em segundo plano. Se o Firebase não carregar, o jogo continua em modo LOCAL em vez de ficar preto.

Arquivos:
- index.html
- style.css
- boot.js
- js/main.js
- js/firebase.js
- firebase-rtdb-rules.json

## Firebase
Authentication: Anônimo precisa estar ativado para visitante.
Para contas com nome/senha, ative E-mail/senha.
Realtime Database: use as regras fornecidas e publique-as no Realtime Database.
