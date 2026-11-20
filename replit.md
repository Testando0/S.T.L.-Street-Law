# RedRP

RedRP é um jogo 3D de mundo aberto inspirado na cultura carioca. GhostCity é uma nova cidade do jogo, com identidade visual inspirada no Dia dos Namorados.

## Run & Operate

- `pnpm --filter @workspace/rio-livre run dev` — Vite em `http://localhost:5173`
- `pnpm --filter @workspace/api-server run build` — build do jogo + bundle da API
- `SKIP_GAME_BUILD=1 pnpm --filter @workspace/api-server run build` — apenas a API
- `PORT=8090 NODE_ENV=production pnpm --filter @workspace/api-server run start` — servidor local completo
- `pnpm run typecheck` — typecheck de todos os pacotes
- `artifacts/android-app/build.sh` — gera e assina o APK
- `RIO_SERVER_URL=https://seu-dominio.replit.app artifacts/android-app/build.sh` — APK já apontando para o servidor
- Variável obrigatória do servidor: `PORT`
- Android SDK: se `~/android-sdk` não existir, baixe os command-line tools em `https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip`, descompacte em `~/android-sdk/cmdline-tools/latest` e rode `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"`.

## Deployment

- Configuração: `.replit` (`deploymentTarget = "autoscale"`) e os manifests em `artifacts/rio-livre/.replit-artifact/artifact.toml` (web, `/`) e `artifacts/api-server/.replit-artifact/artifact.toml` (API, `/api`, `/ws` e `/download`).
- O artifact web publica `artifacts/rio-livre/dist` como site estático em `/`.
- A API roda `node --enable-source-maps artifacts/api-server/dist/index.mjs` na porta `8080`; health check em `/api/healthz`.
- Autoscale pode encerrar WebSockets ociosos; para multiplayer sempre online é necessário Reserved VM.
- A publicação é feita pelo usuário no editor do Replit; o processo manual em `8080` mantém apenas o domínio de desenvolvimento ativo.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, Vite 7
- Jogo: Three.js `^0.186.1`, TypeScript, DOM/CSS próprio
- Servidor: Express 5 + `ws`
- Android: WebView nativo, Android SDK 34, build-tools 34.0.0, JDK 17

## Where things live

- `artifacts/rio-livre/src/game.ts` — loop principal, câmera, jogador, veículos, missões, rede
- `artifacts/rio-livre/src/world.ts` — cidade, colisões, garagem, praia, morros e mapas
- `artifacts/rio-livre/src/ui.ts` — menus, HUD, modais, garagem, celular, chat
- `artifacts/rio-livre/src/network.ts` — cliente WebSocket e jogadores remotos
- `artifacts/rio-livre/src/profile.ts` — save local, configurações e descoberta do servidor
- `artifacts/rio-livre/src/config.ts` — spawn, veículos, qualidade, versão e constantes
- `artifacts/api-server/src/multiplayer.ts` — protocolo WebSocket, salas, chat e estatísticas
- `artifacts/api-server/src/routes/status.ts` — `/api/status` e `/api/leaderboard`
- `artifacts/api-server/src/app.ts` — jogo estático, fallback SPA, APK e cabeçalhos
- `artifacts/api-server/src/index.ts` — servidor HTTP + WebSocket
- `artifacts/android-app/prepare-assets.mjs` — empacota o build e injeta configuração APK
- `artifacts/android-app/src/com/riolivre/game/MainActivity.java` — WebView Android
- `artifacts/android-app/output/rio-livre.keystore` — chave de assinatura persistente

## Architecture decisions

- O build do Vite vai para `artifacts/rio-livre/dist` com `base: "./"` e assets com hash.
- O servidor da API também serve `artifacts/rio-livre/dist` como fallback em desenvolvimento.
- O APK é servido por rota explícita a partir de `artifacts/api-server/apk/rio-livre.apk`, fora da pasta estática, porque o Vite limpa a pasta de saída.
- Jogo e API compartilham a mesma origem em produção; o cliente WebSocket deriva `ws://` ou `wss://` da URL atual.
- O APK carrega o jogo por `file://`, por isso `prepare-assets.mjs` converte o script de módulo em script clássico com `defer` e injeta `window.__RIO_APK__`.
- Sem `RIO_SERVER_URL`, o APK inicia offline e mostra “Defina o endereço do servidor nos ajustes”.
- O save fica em `localStorage` na chave `rio_livre_profile_v1`; a posição inicial vem de `SPAWN`.

## Product

- Mundo aberto com praia, morros, favela, centro, garagem e trânsito.
- Quadras comerciais: térreo com lojas funcionais (interior e balcão) e 1 a 4 andares residenciais por cima (janelas, varandas, cornijas, caixa d'água, antenas e ar-condicionado no telhado), só visuais.
- Personagem personalizável, celular, mapa, missões, corridas, entregas e nível.
- Garagem com compra, tunning, pintura e troca de veículo.
- Polícia, dano veicular, clima, ciclo de dia/noite e áudio sintetizado.
- Multiplayer online com jogadores remotos, chat, contagem e ranking.
- Estabelecimentos com interior: dá para entrar, andar dentro, falar com o atendente e comprar no balcão.
- Atropelamento de pedestres: o carro derruba, aplica multa e aciona a polícia; pedestres próximos entram em pânico.
- PWA instalável e APK Android offline com suporte a servidor configurável.

## User preferences

- Interface e textos em português do Brasil.
- Conteúdo original; não copiar nomes, artes ou assets do RioRise.
- Código sem comentários.
- Experiência mobile-first, com controles de toque e bom desempenho em celular.
- Versão exibida do jogo: `1.7.1`; APK: `1.0.12` (versionCode 10012).

## Gotchas

- A porta `8080` é o serviço da API; use `8090` apenas para testes locais.
- Sempre rode o build do jogo depois de alterar o código para atualizar `artifacts/rio-livre/dist`.
- O servidor de teste não recarrega sozinho; reinicie após cada build.
- `ROAD_LINES` tem 7 ruas; capacidades de `InstancedMesh` devem ser calculadas pela quantidade real de ruas. Contagens acima da capacidade geram triângulos gigantes na tela.
- Preserve `rio-livre.keystore` e a senha para publicar atualizações assinadas.
- O APK 1.0.12 aponta para `https://projeto-java-script-com-shell--redzinkyd.replit.app`; rebuilde com `RIO_SERVER_URL` após obter o domínio final de publicação.
- Service worker e cache do navegador podem mascarar builds antigos em testes locais.
- O download do APK só aparece após a rota `/download/rio-livre.apk` responder `200`.
- Ao mexer na geometria dos comércios, rode `pnpm --filter @workspace/rio-livre run verify`: o script confere porta, colisão de balcão, alcance do jogador e o atropelamento de pedestres em Node (sem WebGL).
- O merge estático da cidade remove as malhas de quem entra no grupo: marque o jogador, veículos e NPCs com `userData.noMerge = true` ou eles somem da cena.
- Cada placa pintada na fachada é uma loja de verdade: prédio estreito tem 2 vitrines, largo tem 4, e a área de vendas de cada loja é só a sua vitrine (`bayWidth`).

## Pointers

- Versão do jogo: `artifacts/rio-livre/src/config.ts`
- Configuração do site: `artifacts/rio-livre/.replit-artifact/artifact.toml`
- Configuração da API: `artifacts/api-server/.replit-artifact/artifact.toml`
- APK para download: `artifacts/api-server/apk/rio-livre.apk`
- APK assinado: `artifacts/android-app/output/rio-livre.apk`
- Testes de geometria e atropelamento: `artifacts/rio-livre/tests/verify.ts`
