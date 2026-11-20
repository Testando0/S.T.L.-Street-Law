# RedRP — GhostCity

RPG 3D de mundo aberto mobile-first ambientado em GhostCity, uma cidade carioca com clima de Dia dos Namorados.

## Jogar

```bash
pnpm --filter @workspace/rio-livre run dev
```

Acesse `http://localhost:5173`.

## Build

```bash
pnpm --filter @workspace/rio-livre run build
pnpm --filter @workspace/rio-livre run verify
```

O jogo é publicado em `artifacts/rio-livre/dist` e também empacotado no APK Android.

## O que tem no jogo

- Cidade com estabelecimentos funcionais: mercado, padaria, farmácia, banco, roupas, oficina e mais.
- Entrada nos interiores, balcão de compras, comida, remédios, roupas e peças de carro.
- Missões de táxi, entrega, corrida, fuga, limpeza da praia e bicos.
- Dinheiro, XP, níveis, fome, vida, inventário, casas e garagem.
- Carros, motos, trânsito, polícia, pedestres, clima, dia/noite e multiplayer.
- PWA instalável e APK Android assinado.
