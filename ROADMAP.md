# Roadmap / backlog

Ideias já mapeadas mas deliberadamente fora do escopo de quando foram
descobertas — não iniciar nenhuma sem pedido explícito do usuário.

## "Assistir ao Jogo" 3D — próximas camadas

Fonte: prototype gerado pelo Gemini (`Downloads/nba-gm-mobile.zip`, compartilhado
2026-08-20). O código em si é web-only (`Platform.OS === 'web'` + Web Audio API
puro) e não roda no app nativo — só as **ideias** valem, não o código. O que já
foi aproveitado (câmeras fixas, indicador de cesta, som de drible/torcida) está
commitado, assim como a chamada de jogada ao vivo; o resto segue em aberto:

- ~~Chamar jogada tática ao vivo durante o jogo 3D~~ **Feito**: as quatro
  jogadas (Pick & Roll, Pindown 3PT, Post-Up, Isolar a Estrela) vivem em
  `WATCH_PLAY_META` (`simulationService.ts`) com a coreografia em
  `services/watchDirector.ts`. Junto veio o pré-requisito: o jogo deixou de ser
  pré-resolvido — cada quarto é resolvido quando começa (mesmo
  `computeExpectedPoints` que `advanceLiveQuarter` fatia num Jogo 7), com
  huddle entre quartos e `Pedir tempo` re-abrindo o restante do quarto. A
  quadra passou de 2 bonecos parados pra 10 jogadores reais disputando posses.
- **Substituições + fadiga/stamina ao vivo** — o que sobrou desse item: hoje os
  cinco titulares jogam os 48 minutos. `PlayerState[]` (watchDirector.ts) já é
  o ponto de entrada exato, e `buildFive` é onde a troca entraria. Pedir tempo
  já existe. Escopo grande o bastante pra merecer seu próprio plano
  (`EnterPlanMode`) antes de começar.
- **Sistema de personalidade/química de vestiário** (líder/estrela/prodígio/
  mentor/workhorse/imprevisível — `services/lockerRoomService.ts` +
  `screens/LockerRoomHub.tsx` no zip do Gemini). Já tinha sido descartado antes
  como "personalidade+imprensa" fora de escopo (ver histórico do roadmap A-F);
  o zip do Gemini implementou essa mesma ideia de forma independente.

## NBA Eras (MyEras) — pendências

- ~~Fonte alternativa de rating histórico pré-1996-97~~ **Resolvido
  2026-08-20**: `leagueleaders` (outro endpoint do nba_api) tem box score
  clássico real desde pelo menos 1959-60. Modelo clássico construído e
  validado (`nba-gm-simulator` commit `ddfb875`), Magic vs. Bird Era (1979-80→
  1989-90) e Jordan Era (1990-91→1997-98) puxadas e commitadas
  (`nba-gm-mobile` commit `0e9c315`) — 19 temporadas reais encadeadas.
- **Filtro de TV / uniformes de época**, além do piso retrô já implementado
  (`src/theme/eraVisuals.ts`) — cosmético, fora do escopo original por
  decisão do usuário.
- **Regras de simulação variáveis por era** (ex. sem linha de 3) — fora de
  escopo: o motor não tem engine de faltas em lugar nenhum do projeto, e
  nenhuma era alcançável hoje precisaria dessa regra mesmo (todas pós-1979).
