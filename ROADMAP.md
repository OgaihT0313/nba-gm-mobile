# Roadmap / backlog

O que **ainda não foi feito**, em ordem de prioridade. Reescrito em 2026-09-10,
depois da rodada que calibrou o motor e construiu a fila de decisões — a lista
anterior tinha itens já entregues.

Histórico e raciocínio das decisões já tomadas: [PLANO-V2.md](PLANO-V2.md) e
[PLANO-DECISOES.md](PLANO-DECISOES.md). **Não iniciar nada daqui sem pedido
explícito do usuário.**

---

## 0. Rodar um APK — FEITO (2026-10-04)

Último APK testado pelo usuário: `609f0b0c` (tudo até `3e07c3f` — item 4
completo, elencos 2026-27, 3D novo), sem problemas.

**Elenco padrão de volta a 2025-26 (2026-10-05)**, a pedido do usuário depois de
jogar: os elencos 2026-27 (pré-temporada, avaliados pelas estatísticas de
2025-26, calouros pela posição no draft) bagunçaram salários, OVR e
estatísticas. Voltaram os dados 2025-26 originais, com as 27 mudanças reais da
offseason de 2026 replayadas na passagem para a 2ª temporada. O pipeline
continua sabendo gerar a pré-temporada (`fetch_data.py --stats-season`).

**Sem replay da offseason real no save atual (2026-10-05)**, também a pedido do
usuário: engessava, e ele quer o "e se...". Da primeira offseason em diante, as
trocas e assinaturas da liga são da simulação (agência livre, trocas da CPU,
draft). `data/offseason_moves.json` e o flag `offseasonMovesApplied` saíram; as
eras históricas continuam encadeando a história real.

Build `ab6933d3` (tudo até a rodada de UI/UX, SDK 57.0.26) instalado e testado
pelo usuário no celular: sem problemas, inclusive em sessão longa. A correção do
Hermes V1 (`806f0d2`) está confirmada fora do navegador.

---

## 1. Ciclo de contratos — FEITO (2026-10-04)

Ver [PLANO-CONTRATOS.md](PLANO-CONTRATOS.md). Teto flexível com os números
reais de 2025-26, preço de mercado em todo contrato novo, direito de renovação,
exceção de nível médio, mercado que esfria, extensão na fila de decisões e
imposto cobrado pelo dono. Medido em `scripts/check_contracts.ts`.

Dinheiro morto ao dispensar: FEITO (2026-10-04) — o salário de quem é
dispensado sob contrato fica na folha (`Team.deadMoney`, somado em
`getTeamSalary`) até o contrato acabar, e a confirmação diz o preço antes.

## 2. Substituições e fadiga ao vivo no "Assistir ao Jogo" — FEITO (2026-10-04)

Ver [PLANO-BANCO.md](PLANO-BANCO.md). Energia por jogador, rotação automática
que roda o banco em minutos de NBA, aba **Quinteto** no huddle (trocas por
toque, rotação automática liga/desliga), energia dos seus cinco ao vivo com
aviso de exausto, e os minutos jogados na tela vão para o box score e para a
carga — segurar o titular o jogo todo custa no risco de lesão do jogo seguinte.

## 2b. O 3D refeito — FEITO (2026-10-04)

Pedido do usuário: o "Assistir ao Jogo" parecia protótipo. Refeito do zero em
`components/court3d/` — piso de madeira com a quadra pintada nas cores do
mandante (texturas geradas por código, `textures.ts`), arena com ~3.300
torcedores instanciados, placas de LED, mesa, bancos e telão (`Arena.tsx`),
cestas com vidro, rede e relógio de posse, e jogadores articulados com camisa e
número que correm, defendem, driblam e sobem pro arremesso (`PlayerRig.ts`).
Câmera nova "Perto" segue a bola. ~280 draw calls e ~250k triângulos, texturas
montadas em ~120 ms (V8) ao abrir a tela. Testado no celular pelo usuário no
APK `609f0b0c` (2026-10-04): tudo certo.

## 3. Tornar visível o que já existe — FEITO (2026-10-04)

Os quatro itens entraram juntos com uma rodada de acessibilidade e legibilidade:

- Tanking da CPU marcado em `TeamsList` (etiqueta "Loteria") e `TeamDetail`.
- Propostas expiram em `OFFER_TTL` (8 jogos), com contagem no card; a caixa vai
  a 3. Medido: 3,9 propostas por temporada (eram ~2).
- `Screen` ganhou `stickyHeader`; a Simulação mostra time, campanha, jogo e o
  humor do dono quando o hero sai da tela.
- A fase aberta (Draft / Agência Livre) ocupa o lugar de Playoffs na barra.

De quebra: todo `Pressable` declara papel (eram 62 sem — leitor de tela via
"genérico"), estados vão por `aria-*` (o `accessibilityState` não chegava ao
web), o `CtaButton` desabilitado mantém o `sub` que explica o porquê, rótulos
nunca abaixo de 9px (`MIN_LABEL_SIZE`; eram 186 entre 7 e 9,5px), barra de baixo
em 10px, `pointerEvents` movido para `style` (aviso de depreciação), e o SDK 57
alinhado nos patches (`expo-doctor` 21/21).

## 4. Imprensa e storylines — FEITO (2026-10-04)

O último item da camada de fantasia. Coletivas, manchetes, rivalidades, jogos de
revanche, marcos de carreira.

Ficou por último de propósito e continua fazendo sentido: ele precisava de uma
**superfície de decisão** pra grudar, e agora ela existe. A personalidade já
mostrou o caminho — o arquétipo não virou texto no card, virou como o jogador
responde à sua escolha. Imprensa tem que passar pelo mesmo teste.

**Restrição dura:** nada disso pode ser anunciado pelo feed `season.events`. O
buffer é de 50, a tela mostra 6, e uma offseason empurra centenas.

Fases: **coletiva** → rivalidades e jogos de revanche → manchetes e marcos de
carreira.

### 4a. Coletiva — FEITO (2026-10-04)

`services/pressService.ts`. A coletiva é uma decisão da fila (tipo
`press_conference`), chamada depois de 6 derrotas ou 7 vitórias seguidas — no
máximo 2 por temporada, 15 jogos de intervalo, nenhuma antes do jogo 10. Medido:
~1 por temporada, e a fila ficou em 6-7 decisões (dentro do orçamento de 4-8).

Cada resposta mexe em número que o motor lê:

- **Má fase:** bancar o elenco (ânimo da rotação +8, dono −3), cobrar o mais bem
  pago do quinteto (o dono gosta, +3; quanto o ânimo dele cai depende do
  arquétipo — o Líder aguenta e o time ganha embalo, o Imprevisível pode explodir
  e pedir para sair) ou garantir os playoffs.
- **Boa fase:** um jogo de cada vez (nada muda), dizer que é candidato (promessa
  de final de conferência; a Estrela adora) ou dar o crédito a um coadjuvante (o
  ânimo dele sobe, e uma Estrela na rotação fica incomodada).
- **Promessa pública:** uma por temporada, guardada em `owner.press`, aparece no
  painel do dono na Simulação e é cobrada em `evaluateSeasonOutcome`: cumprida
  +5, quebrada −12, e o dono cita a coletiva no veredito.

Medido em `scripts/check_decisions.ts`. A coletiva cede quando a temporada já
parou 7 vezes (`PRESS_QUEUE_CEILING`), para não estourar o teto da fila.

### 4b. Rivalidades e jogos de revanche — FEITO (2026-10-04)

`services/rivalryService.ts`.

- **Revanche:** quem trocou de time ganha +4 de OVR (o mesmo efeito "em
  chamas" que o motor já usa) no primeiro jogo contra o ex-time — vale para o
  craque que você trocou e volta para te castigar, e para o que você tirou de
  um rival. Quem mudou é derivado comparando os elencos dia a dia
  (`rosterSnapshot`), então toda rota de mudança entra. As mudanças da offseason
  real que levou ao elenco padrão vêm marcadas no `players.json` (`formerTeam`,
  gerado por `nba-gm-simulator/pipeline/sync_former_teams.py`) e viram revanche
  já na primeira temporada (~78 com o elenco 2025-26). Medido: ~46-56 noites de
  revanche por temporada na liga, ~2,5 envolvendo o seu time.
- **Rivalidades do seu time:** esquentam com eliminação nos playoffs (quem te
  eliminou vira rival na hora) e com jogos decididos por até 5 pontos; esfriam
  pela metade a cada verão; no máximo 3 rivais. Vencer um rival dá ânimo (+4) e
  embalo à rotação, perder tira (−3). Medido: ~2 rivais e ~2-3 jogos contra
  rival por temporada.
- Aparece no card do próximo jogo (Rival / Revanche, com o motivo e o efeito),
  na etiqueta "Rival" da lista de franquias e na página do time. Nada no feed.

Medido em `scripts/check_rivalry.ts` (carreiras com playoffs reais).

### 4c. Marcos de carreira e manchetes — FEITO (2026-10-04)

- **Carreiras reais:** `nba-gm-simulator/pipeline/sync_careers.py` grava em
  `players.json` os totais reais de carreira (jogos, pontos, rebotes,
  assistências, roubos, tocos) e os prêmios (títulos, MVPs, All-Star, All-NBA…)
  de cada jogador, com `career.seeded`. A ficha do jogador mostra a carreira
  real e o próximo marco. Com `--through` a carreira para na temporada anterior
  ao elenco (elenco 2025-26 → `--through 2024-25`), senão o ano que o save vai
  jogar contaria duas vezes.
- **Marcos** (`services/milestoneService.ts`): 5 mil a 50 mil pontos, rebotes,
  assistências, roubos, tocos e jogos. Na noite do marco o ânimo do jogador sobe
  (+10). Um veterano a uma temporada de um marco grande adia a aposentadoria
  (chance × 0,35) — o recorde segura o jogador na liga. Só contam carreiras reais
  ou de quem foi draftado dentro do save (numa era antiga a carreira começa do
  zero, e os marcos seriam falsos).
- **Manchetes** (`services/headlineService.ts`): a primeira página da
  temporada, derivada do estado a cada leitura — marco atingido, marco perto,
  corrida ao MVP (a mesma conta do prêmio, `mvpScore`), maior sequência da liga,
  cadeira quente do dono e a promessa da coletiva. Nenhuma manchete é mecânica
  nova: cada uma é a cara de algo que o motor já faz. Painel na Simulação, nunca
  o feed.

Medido em `scripts/check_milestones.ts`.

**Item 4 concluído.**

---

## Menor, ou fora de escopo por decisão

- **Feed ainda é 62% lesão.** Não desce sem tornar sequência quente / má fase /
  vestiário eventos **por time** (hoje é um time sorteado por dia). Isso os
  tornaria ~30× mais comuns e eles mexem em rating e momentum — é mudança de
  balanceamento, pede re-medir o `diagnose_season`.
- **Aposentadoria + curva de evolução — FEITO (2026-10-04).** Não havia
  aposentadoria e a liga envelhecia: o top-8 médio caía 4,5 de OVR em 10 anos.
  Medindo por faixa de idade apareceu a causa real — os calouros chegavam a ~68
  e não evoluíam (a evolução dependia quase só de minutos, que calouro não tem)
  e quem tinha 24-28 ganhava ~+0,1 por ano. `retirementService.ts` aposenta
  ~37 por temporada (painel próprio na tela de Simulação, nunca o feed), e a
  curva em `runPlayerProgression` foi recalibrada. Em 10 anos: top-100 86,4 →
  85,6 (era 86,0 → 81,7), top-8 81,9 → 80,0. Resta uma erosão lenta depois do
  7º ano; o `check_contracts` tem portão para ela não voltar a crescer.
- **Ratings de veteranos no pipeline.** `T.J. McConnell` está OVR 88 aos 34 anos
  no `data/players.json`. O `pickSeriesMVP` está certo; o rating é que é
  estranho, e vem do modelo Python no repo irmão (`nba-gm-simulator`).
- **`diagnose_season.ts` não responde às decisões** — só simula. Como decisões
  só afetam o time do usuário (1 de 30), as métricas de liga não se movem, mas é
  uma inconsistência.
- **Filtro de TV / uniformes de época** — cosmético, fora de escopo por decisão
  do usuário.
- **Regras de simulação variáveis por era** (ex. sem linha de 3) — o motor não
  tem engine de faltas em lugar nenhum, e nenhuma era alcançável precisaria.

---

## O que eu **não** faria

**Reescrever o motor em posses.** A calibração tornou isso desnecessário: o
modelo de pontos esperados produz 0 de 23 métricas fora da faixa real da NBA.
Seriam meses pra ganhar realismo que já existe.

**Refazer a UI inteira de novo.** A tentativa de paisagem foi construída,
avaliada e descartada em 2026-09-09. O que sobrou dela está no item 3.
