# Vila RP — v0.2

Primeira reconstrução do protótipo com foco em sensação de jogo, mobile e multiplayer.

## Incluído
- Canvas 2D pixel-art responsivo
- Mundo procedural infinito por chunks
- 6 biomas: planície, floresta, deserto, tundra, pântano e montanha
- Dia/noite
- Mobs noturnos
- Mineração e colocação de blocos
- Bedrock na última camada
- Água e lava como blocos líquidos básicos
- Minérios
- Inventário 32 slots + hotbar
- Crafting rápido
- Chat global
- Lista de jogadores online
- Firebase Authentication + Realtime Database
- Salvamento local e presença online
- Controles desktop e celular

## Firebase
No console Firebase:
1. Authentication → Método de login → ative **Anônimo**.
2. Para contas com nome/senha, ative **E-mail/senha**.
3. Realtime Database já está configurado no código com a URL do seu projeto.
4. Cole `firebase-rtdb-rules.json` nas regras do Realtime Database durante os testes.

> IMPORTANTE: as regras acima são de protótipo e permitem leitura pública. Antes de abrir para o público, vamos trocar por regras seguras e validar tudo pelo `auth.uid`.

## GitHub Pages
Suba o conteúdo desta pasta na raiz do repositório e ative Settings → Pages → Deploy from branch → main → /root.

## Próximo update
- Sistema de chunks persistentes no Firebase
- Água/lava com propagação por células
- Ferramentas e durabilidade
- Sistema de dano/PvP
- Mais mobs e IA
- Casas/NPCs/lojas
- Biomas mais distintos
- Iluminação por blocos
- Cavernas
- Partículas
- Sons
- Melhor sincronização multiplayer
