# Staff além do técnico — plano

Item 11 do [ROADMAP.md](ROADMAP.md). Pedido pelo usuário em 2026-10-13: quatro cargos,
orçamento rígido. Aprovado em 2026-10-15.

**Andamento:** fase 1 **feita e medida** (2026-10-15), falta testar no aparelho: `services/staffService.ts`, `components/StaffPanel.tsx` (a aba Técnico de Meu Time virou "Staff"), preparador em `handleRandomEvents` e `recordGameStats`, olheiro em `scoutProspect`, mercado em `startOffseason`, interinos em `startSeason`, saves antigos com staff nota 3 em `loadGame`, `scripts/check_staff.ts` (`node .check/scripts/check_staff.js [temporadas] [seções]`).

**Medido (`check_staff`, `diagnose_season`, `backtest_season`):**
- Liga: média 3,03 na abertura (1:8% 2:25% 3:33% 4:24% 5:10%) e 2,96 depois de 10 entressafras; nenhum time acima do orçamento.
- Preparador, 16 temporadas por braço, top 8 do time: nota 5 perde 35 jogos, nota 3 48, sem staff 49, nota 1 55 — 36% menos com 5 do que com 1 (meta 25-35%, dentro do ruído de ±5-8).
- Olheiro, 300 classes: erro no top 15 do quadro 1,55 (nota 5, 17 avaliações) / 2,06 (3) / 2,56 (1) — 39,5% menor; potencial certo 80% / 72% / 67%.
- `diagnose_season`: 0 de 23 métricas fora da faixa, como antes.
- `backtest_season` (20 rodadas): r 0,852 → 0,837 e RMSE 7,1 → 7,5. É o custo do staff aleatório: elencos iguais passam a perder números diferentes de jogos por lesão. Pequeno, mas é piora — a meta do plano era "não piora".

**O que mudou do plano na fase 1:**
- **Staff mora no `Team`** (`team.staff`, `team.staffDeadMoney`), não num mapa em `SeasonState`: a simulação já recebe o time, então lesão e carga leem o preparador sem mudar assinatura nenhuma.
- **Preparador mais fraco que o plano:** chance de lesão ×1,1 → ×0,9 e duração ×1,08 → ×0,92 (carga ×1,15 → ×0,85 mantida). Os números originais se multiplicam e davam 62% menos jogos perdidos de 5 para 1.
- **Olheiro: a faixa inicial do quadro não muda.** O quadro de projeções é um só, lido pelo usuário e pela CPU; estreitá-lo ajudaria os 29 times da CPU tanto quanto você. O olheiro age nos seus relatórios: avaliações 8/10/12/14/17, quanto cada relatório estreita a faixa (sobra 60% → 50%; era 55% fixo) e a releitura do potencial a cada relatório (acerta 55% → 80%). O olheiro da CPU não tem efeito no draft dela.
- **Salários:** nota 1 US$ 0,5 mi, 2 0,9, 3 1,5, 4 2,5, 5 4,0 (±10%). Quatro notas 3 = US$ 6 mi.
- **Orçamento em três faixas:** 9 mi (LAL, LAC, NYK, BKN, GSW, CHI, BOS), 6 mi (13 mercados pequenos), 7,5 mi o resto. A CPU gasta até o limite na abertura e, ao repor um cargo, deixa salário mínimo para os outros vagos.
- **Analista e vestiário já existem** (contratáveis, custam orçamento), com o efeito marcado como "entra na próxima atualização" até a fase 2.
- **Fim de contrato do seu staff:** o profissional volta como candidato no mercado, com 10% de aumento (a renovação antecipada continua na fase 3).

## A regra que mantém a liga calibrada

O item estava marcado como grande porque "cada cargo mexe num sistema já calibrado". Ele
fica médio com uma regra só:

> **Cada cargo mexe em um sistema, e o efeito é medido contra o profissional médio.**
> Os 30 times têm staff. Um profissional nota 3 (médio) não muda nada; 5 melhora, 1 piora,
> na mesma medida. A média da liga continua onde está.

Assim `diagnose_season`, `check_coaches` e o backtest não se mexem no agregado: o que muda
é a distribuição entre times. Staff bom é vantagem de quem o tem, não inflação geral. A
CPU recebe staff gerado com a mesma distribuição de notas e o troca na entressafra.

## Os quatro cargos

| Cargo | Sistema | Efeito (nota 1 → 5, 3 = neutro) | Onde no código |
|---|---|---|---|
| **Preparador físico** | Lesões e desgaste | Chance de lesão do time ×1,25 → ×0,75; duração ×1,2 → ×0,8; ganho de carga (`load`) por minuto ×1,15 → ×0,85 | `INJURY_CHANCE_PER_TEAM` e `rollInjury` em `simulationService`; o acúmulo de `p.load` em `recordGameStats` |
| **Olheiro-chefe** | Draft | Avaliações por draft 8 → 18 (hoje 12 fixas); incerteza inicial das faixas ±2; chance de o potencial lido estar certo 55% → 80% (hoje 65%) | `SCOUT_BUDGET`, `initialUncertainty`, `guessPotential` em `draftService`; `initialDraft` em `offseasonService` |
| **Analista de desempenho** | Jogo assistido no 3D | Antes de cada quarto, um relatório do adversário aponta a jogada que mais o castiga (lido da defesa real dele: perímetro fraco → pindown, garrafão fraco → post-up...). Se você chamar essa jogada, o quarto rende de +0,5 (nota 1) a +2,0 pontos (nota 5); o relatório de um analista fraco às vezes erra | `planQuarter` no `watchDirector`, somado ao `selfDelta` como o pedido de tempo; tela do intervalo no `WatchGameScreen` |
| **Assistente de vestiário** | Ânimo e química | Alvo de ânimo do elenco −4 → +4; a moral que dispara um pedido de troca (`TRADE_REQUEST_MORALE`, 25) desce até 20 ou sobe até 30 | `updateMorale` / `moraleTargetShift`; `decisionService` (pedido de troca) |

Por que esses quatro:
- **O desenvolvimento dos jovens fica com o técnico** (`coach.development` já existe).
  Um "assistente de desenvolvimento" contaria a mesma coisa duas vezes.
- **Nenhum mexe no ataque ou na defesa do time em quadra.** Coordenador ofensivo ou
  defensivo mudaria a força de todo jogo, exatamente o que o `check_coaches` calibra.
- **O analista só age no jogo que você assiste e quando você segue o relatório.** É uma
  vantagem por decisão, como o pedido de tempo, então não altera a temporada simulada.

## O profissional

- **Nome, idade, nota de 1 a 5, salário e um traço.** O traço faz a melhor nota nem
  sempre ser a melhor escolha. Exemplos:
  - Preparador "Velha guarda": cuida melhor de jogadores de 30+, pior dos de 22.
  - Olheiro "Mercado internacional": acerta mais nos estrangeiros, menos nos
    universitários.
  - Analista "Defensivo": lê bem a defesa adversária, pior o ataque (o relatório erra mais
    quando o problema do adversário está do outro lado).
  - Assistente "Linha dura": segura os imprevisíveis, irrita as estrelas.
- **Salário pela nota:** de ~US$ 0,5 mi (nota 1) a ~US$ 4 mi (nota 5) por cargo.
- **Contrato de 1 a 3 anos.**
- **Idade e aposentadoria** como as dos técnicos (`ageCoachesAndRetire`).

## Orçamento rígido

- **Cada franquia tem um orçamento de staff por temporada,** separado do teto salarial dos
  jogadores e definido pelo mercado e pela paciência do dono:
  - mercados grandes, como LAL, NYK e GSW: ~US$ 9 mi;
  - mercados pequenos: ~US$ 6 mi.
- **Os quatro melhores custariam ~US$ 16 mi, então não cabem.** A escolha é onde gastar.
- **O limite é rígido:** contratar acima dele é bloqueado na tela, como no teto de jogadores.
- **Demitir é possível:** o salário restante continua contando no orçamento até o fim do
  contrato, como o dinheiro morto de jogadores.

## Mercado

- **Na entressafra,** cada cargo vago ou com contrato vencido abre um mercado com 3 ou 4
  candidatos, gerados como os técnicos (`generateCandidates`), com a qualidade puxada pela
  atratividade do time.
- **A CPU preenche os seus cargos sozinha.** Depois de uma boa temporada, um time da CPU
  pode tirar de você um profissional nota 4 ou 5 com o contrato vencendo, a menos que você
  renove antes (custa mais).
- **No meio da temporada só é possível demitir.** A vaga fica com um interino nota 2 até a
  entressafra.

## Telas

- **Meu Time → aba "Staff":**
  - o técnico, que já existe no `CoachPanel`, e os quatro cargos;
  - em cada cargo: nota, traço, contrato, salário e o efeito em uma linha, por exemplo
    "−18% de lesões".
  - no topo, a barra do orçamento.
- **Mercado de staff,** na mesma aba durante a entressafra, com filtro por cargo.
- **O efeito aparece onde o sistema aparece:**
  - o relatório do analista no intervalo do jogo 3D;
  - a faixa e o número de avaliações do olheiro na tela do draft;
  - o preparador nas lesões ("recuperação acelerada: volta em 6 jogos em vez de 8").
- **No Minha Carreira:** o staff do seu time pesa em você (lesões e ânimo) e aparece na
  aba Time.

## Medição

`scripts/check_staff.ts`:
- **Liga com staff aleatório:** os números do `diagnose_season` continuam na faixa e o
  backtest de vitórias não piora.
- **Time com staff 5 contra staff 1, mesmo elenco, 10 temporadas.** Meta por cargo:
  - preparador: 25-35% menos jogos perdidos por lesão;
  - olheiro: erro médio da projeção no draft cai ~40%;
  - vestiário: pedidos de troca caem ~1/3.
- **Analista:** margem por quarto seguindo o relatório contra o mesmo quarto sem relatório
  (+0,5 a +2,0 conforme a nota) e taxa de acerto do relatório (60% → 90%).
- **`check_coaches` inalterado,** porque nenhum cargo toca a força do time.

## Fases

| Fase | O que entrega | Tamanho |
|---|---|---|
| 1 | Modelo (`Staff` por time em `SeasonState`), geração para os 30 times, orçamento, aba Staff, mercado na entressafra; **preparador e olheiro** com efeito; `check_staff` desses dois | M |
| 2 | **Analista** (relatório no intervalo do 3D, bônus por seguir) e **assistente de vestiário** (ânimo e pedido de troca); `check_staff` completo | M |
| 3 | Perda de profissionais para a CPU, renovação antecipada, traços; staff no Minha Carreira | P |

## Decisões tomadas

- Quatro cargos (usuário, 2026-10-13).
- Orçamento rígido (usuário, 2026-10-13).

## Em aberto (respondo ao começar, salvo objeção)

- **Saves antigos:** ganham staff gerado com nota média na primeira abertura, sem mudar
  nada no meio da temporada.
- **Eras:** o mesmo sistema e o mesmo orçamento. Os salários das eras já estão na escala
  de hoje (`compute_salary`), então não há o que corrigir.
