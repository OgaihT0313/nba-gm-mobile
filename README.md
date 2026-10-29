# NBA Manager

Jogo de gerente de time da NBA para celular (Android) e navegador, feito com Expo e
React Native. Você monta o elenco, troca, contrata, escala a rotação e tenta segurar
o emprego enquanto o dono cobra resultado.

**Jogar no navegador:** https://ogaiht0313.github.io/nba-gm-mobile/

## Modos

- **GM:** escolha uma franquia da liga atual e comande temporada após temporada:
  draft, agência livre, trocas, staff, contratos e o humor do dono. Até 3 carreiras
  salvas ao mesmo tempo.
- **Eras:** comece numa temporada histórica, com os elencos e os escudos da época.
- **Minha Carreira:** crie um jogador, passe pelo draft e construa a carreira dele.

## Rodar no computador

Precisa do [Node.js](https://nodejs.org/).

```bash
npm install
npm run web
```

Abre em http://localhost:8081. Para testar no celular, use `npm start` e o app Expo Go.

## Gerar o APK

Ver [BUILD.md](BUILD.md). O APK sai pelo GitHub Actions, na página Releases.

## Organização

| Pasta | O que tem |
|---|---|
| `screens/` | As telas do jogo |
| `components/` | Peças de tela reaproveitadas (ficha do jogador, quadra 3D, painéis) |
| `services/` | As regras: simulação, trocas, contratos, draft, dono, evolução |
| `data/` | Jogadores, times e as eras históricas |
| `scripts/` | Coleta de dados e testes de equilíbrio (`check_*.ts`) |

O [ROADMAP.md](ROADMAP.md) tem o que foi feito e o que vem a seguir.
