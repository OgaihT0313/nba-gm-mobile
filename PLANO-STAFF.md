# Staff além do técnico — plano

Item 11 do [ROADMAP.md](ROADMAP.md). Pedido pelo usuário em 2026-10-13: quatro cargos,
orçamento rígido. Aprovado em 2026-10-15.

**Andamento:** fases 1, 2 e 3 **feitas e medidas** (2026-10-15, 2026-10-17 e 2026-11-08); fase 1 (2026-10-15), falta testar no aparelho: `services/staffService.ts`, `components/StaffPanel.tsx` (a aba Técnico de Meu Time virou "Staff"), preparador em `handleRandomEvents` e `recordGameStats`, olheiro em `scoutProspect`, mercado em `startOffseason`, interinos em `startSeason`, saves antigos com staff nota 3 em `loadGame`, `scripts/check_staff.ts` (`node .check/scripts/check_staff.js [temporadas] [seções]`).

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
- **Analista e vestiário já existiam na fase 1** (contratáveis, custando orçamento), com o efeito marcado como "entra na próxima atualização". Ganharam efeito na fase 2.
- **Fim de contrato do seu staff:** o profissional volta como candidato no mercado, com 10% de aumento (a renovação antecipada continua na fase 3).

**Fase 2 feita e medida** (2026-10-17), falta testar no aparelho: analista em `scoutingReport`/`planQuarter` (`watchDirector`) e no intervalo do `WatchGameScreen`; vestiário em `updateMorale` (`simulationService`) e na linha do pedido de troca (`decisionService`). Efeitos em `staffService` (`lockerMoraleShift`, `lockerRequestLineShift`, `analystAccuracy`, `analystBonus`). `check_staff` ganhou as seções 4 (vestiário) e 5 (analista).

**Medido na fase 2 (`check_staff`, `diagnose_season`, `backtest_season`, `check_watch_director`, `check_decisions`):**
- Vestiário, liga inteira com a mesma nota, 20 temporadas por braço, regra do pedido lida nos 30 times: nota 5 0,373 pedidos por time-temporada, nota 3 0,447, nota 1 0,573 — **35% menos com 5 do que com 1** (meta ~1/3). Moral média 51,6 / 49,6 / 47,6; vitórias iguais (41,0 nos três). Numa liga mista (`initStaff`) as vitórias por nota de vestiário ficaram entre 40,6 e 41,7.
- Analista, 400 confrontos por nota, planos pareados (mesma sequência aleatória): relatório certo 91% / 76% / 60% (alvo 90/75/60), seguir um certo rende +2,00 / +1,26 / +0,49 pts no quarto (alvo +2,0 / +1,25 / +0,5).
- Linha de base do relatório (`WEAK_BASELINE`, média dos quintetos iniciais): pindown 76,2, post-up 79,2, pick & roll 80,4, iso 70,7. Fraqueza principal dos 30 quintetos: pindown 13, post-up 8, P&R 5, iso 4 — o relatório não aponta sempre a mesma jogada.
- `diagnose_season` 0 de 23 fora da faixa; `backtest_season` (20 rodadas) r 0,861 e RMSE 6,9 (fase 1: 0,837 e 7,5 — dentro do ruído); `check_watch_director` e `check_decisions` todos verdes.

**O que mudou do plano na fase 2:**
- **Vestiário mais fraco que o plano.** O alvo de ânimo −4 → +4 e a linha 30 → 20 juntos davam 88% menos pedidos de 5 para 1. Ficou −2 → +2 no ânimo e 26,5 → 23,5 na linha.
- **Como o analista lê o adversário:** cada jogada ataca um número da defesa que está em quadra no começo do quarto — pindown a Def. Perímetro dos alas (SG/SF), post-up a Def. Interior de PF/C, pick & roll a média do armador (perímetro) com o pivô (interior), iso o pior defensor de perímetro dos cinco. A fraqueza é a distância até a média da liga para o mesmo número. Um relatório por quarto; o pedido de tempo mantém o do quarto.
- **O relatório errado aponta outra jogada e não rende nada.** A tela não diz se acertou; mostra a nota e a taxa de acerto dela.
- **O analista nota 3 também tem relatório** (+1,25 pts quando acerta e é seguido): é vantagem por decisão, só no jogo assistido, então não mexe na temporada simulada. O `effectLine` dele nunca diz "sem efeito".
- **Pular até o fim** também gera o relatório de cada quarto pulado: rende se a jogada que ficou valendo for a que um relatório certo apontou.
- Traços (ex. Linha dura) continuam na fase 3.

**Fase 3 feita e medida** (2026-11-08), falta testar no aparelho: traços, renovação antecipada, perda para a CPU e staff no Minha Carreira. Código em `staffService` (`TRAITS`, `extendStaff`, `poachChance`, `staffOffseason`), `StaffPanel` (traço no cartão, botão Renovar, aviso de último ano), `attentionService` (item "no último ano"), `careerLeague`/`careerSave`/`careerLife` e a aba Time do `CareerHub`. `check_staff` ganhou as seções 6 (traços) e 7 (perda e renovação).

**O que entrou na fase 3:**
- **Traços.** Metade dos profissionais tem um; cada cargo tem dois que se espelham, sorteados igualmente, para se anularem na liga. O traço funciona como notas a mais onde ele é bom e a menos onde é fraco:
  - preparador **Velha guarda** / **Escola de base**: ±2 notas na duração da lesão e no ganho de carga de quem tem 30+ / até 23 (a chance de lesão do time não muda);
  - olheiro **Caçador de talento** / **Pé no chão**: +2 notas na leitura do potencial e −2 no estreitamento da faixa, ou o contrário;
  - analista **Olho no perímetro** / **Olho no garrafão**: ±1 nota na taxa de acerto, conforme a fraqueza real esteja no perímetro (pindown, isolação) ou no garrafão (post-up, pick & roll);
  - vestiário **Linha dura** / **Amigo das estrelas**: ±3 de alvo de ânimo para os Imprevisíveis e as Estrelas, em sentidos opostos.
- **Renovação antecipada.** No último ano de contrato, renovar custa 25% a mais (o mercado pede 10%) por 2 anos, a partir da temporada seguinte. O orçamento checado é o da próxima temporada. Demitir ou substituir alguém renovado cancela a renovação, que ainda não tinha começado.
- **Perda para a CPU.** Um nota 4 ou 5 com contrato vencido e sem renovação pode ser levado antes de chegar ao seu mercado: 15% (nota 4) ou 25% (nota 5) de base, mais até 45 pontos conforme a campanha (cheio a partir de 75% de vitórias). Vai para um dos 8 melhores times da CPU com alguém pior no cargo, ganhando 15% a mais. Como a CPU gasta o orçamento inteiro, o time que o contrata reorganiza o staff: os outros cargos mais caros são repostos com o que sobra.
- **Minha Carreira.** A liga da carreira tem staff (`initStaff`), saves antigos ganham staff nota 3 sem traço (`ensureStaff`), e a CPU cuida de todos os times. O preparador do seu time age nas suas lesões, e o assistente de vestiário puxa a sua relação com o vestiário para 46 a 54 (±6 a mais se o traço dele for sobre a sua personalidade). A aba Time mostra o staff com o efeito em você. O relatório do analista não aparece na carreira, porque você não chama as jogadas.
- **Diálogos de Demitir e Renovar** com as cores direto no estilo: na web, o `Modal` fica fora do elemento que define as cores do tema, e o `bg-panel` saía transparente. O mesmo acontece no `CoachPanel`, que não foi mexido.

**Medido na fase 3 (`check_staff` 6 e 7):**
- Traços (nota 3 com cada traço contra nota 3 sem traço, a liga inteira):
  - preparador, 30 temporadas por braço: Velha guarda −7% na lesão de 30+ e +9% na de até 23; Escola de base +4% e −7%; total de jogos perdidos +2,4% e +0,7% (meta ±5%). Com 1 nota em vez de 2 o efeito sumia no ruído;
  - olheiro, um relatório no top 15: Caçador de talento acerta o potencial 82% e deixa a faixa em 51%; sem traço 68% e 43%; Pé no chão 59% e 43%. Gastando o orçamento inteiro a diferença quase some (72-74%), porque os relatórios convergem;
  - analista: Olho no perímetro 83% com a fraqueza no perímetro e 71% no garrafão (sem traço 74-75%); Olho no garrafão 68% e 86%. No total sobe 1-3 pontos, porque um passo para cima vale um pouco mais que um para baixo;
  - vestiário: Linha dura deixa Estrelas em 45,1 e Imprevisíveis em 51,7 (sem traço 48,2 e 48,5); Amigo das estrelas 51,1 e 45,7; ânimo médio da liga igual (49,5).
- Perda para a CPU, 150 verões por célula: levados 26/27/46/71% para nota 5 a 35/50/62/75% de vitórias (chance 25/25/47/70%), 14/18/38/59% para nota 4 (15/15/37/60%), 0 para nota 3. Renovados: 400 de 400 ficaram, nenhum levado.
- Pior caso (você perde até quatro 5s por verão, 10 verões): média da CPU 2,86 contra 2,95 sem perdas, nenhum time acima do orçamento. A reorganização tira um pouco mais do que o 5 traz.
- Correção (2026-11-08): com um 5 caro num orçamento pequeno, a reposição de um cargo com nota 1 podia passar o orçamento em US$ 50-100 mil (o salário de um 1 varia de 0,45 a 0,55 mi). O `refillCpuRole` agora corta o salário desse 1 ao que cabe. Medido em 4 sementes: nenhum time acima do orçamento.

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
