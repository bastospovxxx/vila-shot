# Vila RP

Protótipo jogável de um sandbox 2D pixel art com Firebase.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Vá em Settings → Pages.
4. Em Build and deployment, escolha "Deploy from a branch".
5. Branch: `main`, pasta: `/ (root)`.
6. Salve e abra a URL do GitHub Pages.

Não precisa de Node, npm ou build.

## Firebase usado

- Authentication: e-mail/senha (o jogo apresenta username ao jogador) e anônimo para visitante.
- Firestore: chunks persistentes do mundo e perfis.
- Realtime Database: jogadores online, posição e chat.
- Storage não é necessário para este protótipo.

## Regras

As regras sugeridas na conversa precisam estar publicadas no Firestore e no Realtime Database antes de testar multiplayer/saves.

## Controles

PC:
- A/D ou setas: andar
- W/Espaço: pular
- Clique esquerdo: minerar
- Clique direito: colocar bloco
- 1–8: selecionar hotbar
- E: inventário

Celular:
- D-pad na tela
- Toque no mundo para interagir
