# Roadmap / backlog

Ideias já mapeadas mas deliberadamente fora do escopo de quando foram
descobertas — não iniciar nenhuma sem pedido explícito do usuário.

## "Assistir ao Jogo" 3D — próximas camadas

Fonte: prototype gerado pelo Gemini (`Downloads/nba-gm-mobile.zip`, compartilhado
2026-08-20). O código em si é web-only (`Platform.OS === 'web'` + Web Audio API
puro) e não roda no app nativo — só as **ideias** valem, não o código. O que já
foi aproveitado (câmeras fixas, indicador de cesta, som de drible/torcida) está
commitado; o que segue é escopo maior, ainda não iniciado:

- **Chamar jogada tática ao vivo durante o jogo 3D** (Pick & Roll, Pindown 3PT,
  Post-Up, Isolamento da Estrela) — extensão natural do `TACTIC_META` que já
  existe no Jogo 7 ao vivo (`LiveGameScreen.tsx`), levado pro modo Assistir ao
  Jogo. Precisa de um sistema de posse/animação reagindo à jogada escolhida.
- **Substituições + fadiga/stamina + pedir tempo, tudo ao vivo** — transforma
  "assistir a um replay de 5min já decidido" em "treinar o jogo ao vivo de
  verdade". Escopo bem maior que os itens acima, provavelmente merece seu
  próprio plano (`EnterPlanMode`) antes de começar.
- **Sistema de personalidade/química de vestiário** (líder/estrela/prodígio/
  mentor/workhorse/imprevisível — `services/lockerRoomService.ts` +
  `screens/LockerRoomHub.tsx` no zip do Gemini). Já tinha sido descartado antes
  como "personalidade+imprensa" fora de escopo (ver histórico do roadmap A-F);
  o zip do Gemini implementou essa mesma ideia de forma independente.

## NBA Eras (MyEras) — pendências

- **Fonte alternativa de rating histórico pré-1996-97**, pra eventualmente
  destravar Magic/Bird (1983-84) e o auge do Jordan (1991-95) com dado real —
  hoje o pipeline (`leaguedashplayerstats`) devolve 0 linhas pra essas
  temporadas. Basketball-Reference já deu 403 num teste anterior; nenhuma
  fonte substituta identificada ainda.
- **Filtro de TV / uniformes de época**, além do piso retrô já implementado
  (`src/theme/eraVisuals.ts`) — cosmético, fora do escopo original por
  decisão do usuário.
- **Regras de simulação variáveis por era** (ex. sem linha de 3) — fora de
  escopo: o motor não tem engine de faltas em lugar nenhum do projeto, e
  nenhuma era alcançável hoje precisaria dessa regra mesmo (todas pós-1979).
