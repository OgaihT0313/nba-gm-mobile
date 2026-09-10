# Fila de decisões — plano

## Por que

Medido em 10 temporadas (`scripts/_tmp_decisions.ts`, descartável):

| Numa temporada de 82 jogos, o jogo pede do usuário | |
|---|---|
| propostas de troca recebidas | **2,0** |
| jogadores pedindo pra sair | **0,0** |
| momentos que param a temporada | **0** |

A simulação está calibrada (0 de 23 métricas fora da faixa real da NBA). O que
falta não é realismo — é o jogo **perguntar alguma coisa**. Hoje você aperta
"Avançar temporada" e 82 jogos acontecem *com* você.

A proposta não inventa sistemas. Ela colhe profundidade que **já está simulada e
enterrada**: lesões que mudam sua rotação, moral que despenca, o prazo de trocas
que chega com você fora dos playoffs. Tudo isso já acontece no motor e nunca
chega até o jogador como escolha.

---

## Arquitetura

### Estado, não efeito

`simulateOneDay` já devolve `effects: SimEffect[]` (`notification` | `view`) para
o `App.tsx` reproduzir. Uma decisão **não** é um efeito: efeito é instrução
transitória de replay, decisão é estado durável — tem que sobreviver a fechar o
app e tem que ser lida pela UI.

```ts
// types.ts
export type DecisionKind = 'injury_cover' | 'trade_request' | 'deadline_stance';

export interface DecisionOption {
  id: string;
  label: string;            // "Assinar um veterano"
  detail: string;           // o que acontece, em uma linha
  consequence?: string;     // o preço, explícito ("+$4.2M na folha")
  disabled?: boolean;
  disabledReason?: string;  // por que não dá — nunca um botão morto sem explicação
}

export interface Decision {
  id: string;
  kind: DecisionKind;
  day: number;              // gamesPlayed em que disparou
  headline: string;         // "Dončić fora por 22 jogos"
  body: string;             // a situação, 2-3 frases
  subjectId?: string;       // jogador de que se trata (retrato no card)
  options: DecisionOption[];
}

// SeasonState
decisions?: Decision[];     // fila; opcional, então saves antigos seguem válidos
```

**Fila, não slot único.** Duas decisões podem disparar no mesmo dia; a tela
resolve uma por vez.

### O bloqueio

O loop de simulação no `App.tsx` já para quando `fired` volta verdadeiro. Mesma
forma: para enquanto `season.decisions?.length`. Vale para `+1 dia`, `+7 dias`,
`Metade` e `Avançar temporada` — a temporada não anda com decisão pendente.

### A resolução

```ts
// services/decisionService.ts  — puro, sem React, como o seasonRunner
export function generateDecisions(season: SeasonState): Decision[];
export function resolveDecision(season: SeasonState, decisionId: string, optionId: string): SeasonState;
```

Puro de propósito: é o que permite testar a coisa inteira fora do app, com o
mesmo harness que já achou os bugs desta rodada.

`generateDecisions` é chamado pelo `seasonRunner` no fim do dia, depois de
lesões/moral/prazo, e acrescenta à fila.

---

## As três decisões da primeira leva

Escolhidas porque cada uma **usa um sistema que já existe** e tem preço real.

### A. Cobrir a ausência de um titular — `injury_cover`

**Dispara:** um jogador do seu top-5 (via `getLineup`) sai por **≥ 10 jogos**.

| Opção | O que faz | Preço |
|---|---|---|
| Assinar agente livre | melhor FA que tapa o buraco de posição (`getFreeAgents` + `pickBestForTeam` + `signFreeAgentLegality`) | folha salarial; desabilitado com motivo se ilegal |
| Promover o jovem | crava o jovem no slot (`Team.starters`) e ele ganha os minutos — que é oportunidade de desenvolvimento (`runPlayerProgression` lê `mpg`) | time fica pior agora, jovem evolui |
| Encurtar a rotação | `rotationSize - 1`, concentrando minutos nos titulares restantes | sobe `load` → sobe risco de lesão (`injuryRisk`), que é exatamente o dilema real |

Três opções, três sistemas diferentes já construídos, nenhuma delas grátis.

### B. Jogador pede pra sair — `trade_request`

**Pré-requisito: consertar o limiar, que hoje é inalcançável.** Em
`updateMorale`, o pedido exige moral `< 25`, mas o *alvo* de moral de um jogador
de rotação tem piso em ~25 (`50 + (winPct-0.5)*60` num time de 20% dá 32, `+3`
de rotação, `-10` de estrela desperdiçando o auge = 25) e a moral converge
assintoticamente, nunca ultrapassa. Por isso **0,0 por temporada**.

| Opção | O que faz | Preço |
|---|---|---|
| Prometer mais minutos | sobe ele na rotação, moral recupera | a moral de quem perdeu os minutos cai |
| Colocar no mercado | CPU passa a mandar propostas por ele (`generateCpuTradeOffer` enviesado) | você negocia de posição fraca |
| Ignorar | moral segue caindo | arrasta a química, que já entra em `computeExpectedPoints` |

### C. Postura no prazo de trocas — `deadline_stance`

**Dispara:** 3 jogos antes de `TRADE_DEADLINE_GAME`, para dar tempo de agir.

**Comprar** / **Manter** / **Vender**. Vender liga `Team.tanking` no **seu**
time — a mecânica que a CPU já usa e você não pode. Fecha a assimetria que o
commit `bb61ad5` criou, e a loteria do draft (já implementada) é a recompensa.

---

## Orçamento de frequência — o número que decide se isso é bom ou insuportável

**Alvo: 4 a 8 decisões por temporada.** Uma a cada 10-20 jogos.

Essa é a restrição de design mais importante do plano, e é a lição direta do
feed de eventos: **excesso é tão ruim quanto ausência**. Uma temporada que para
20 vezes vira burocracia; uma que para 2 vezes é a de hoje.

As condições de disparo são apertadas de propósito (top-5, ≥10 jogos) e a taxa
tem que ser **medida antes de embarcar**, não estimada.

---

## Verificação

`scripts/check_decisions.ts`, no mesmo molde de `check_watch_director.ts` e
`diagnose_season.ts`:

- roda N temporadas respondendo automaticamente (aleatório entre as opções);
- reporta **decisões por temporada, por tipo** — o portão é a faixa 4-8;
- garante que **toda temporada chega ao jogo 82**, ou seja, que nenhuma decisão
  trava a fila (deadlock);
- confirma que `diagnose_season.ts` continua em 0 de 23 — resolver decisões
  mexe em elenco e rotação, então pode deslocar o motor.

---

## Riscos

1. **Frequência.** Medir, não chutar. É o portão de embarque.
2. **Deadlock.** Toda decisão precisa de pelo menos uma opção habilitada; a
   opção "não fazer nada" existe sempre.
3. **Saves antigos.** `decisions` opcional; ausência = fila vazia.
4. **Legibilidade da consequência.** Depois de escolher, o efeito tem que ser
   visível no estado (elenco mudou, rotação mudou), não só uma frase.
5. **Nada disso entra no feed `season.events`.** Restrição dura do projeto: o
   buffer é de 50, a tela mostra 6, e uma offseason empurra centenas.

---

## UI

**Modal sobre a tela de Simulação**, não uma tela nova empilhada — é uma
interrupção, e manter sua campanha visível atrás é o que dá peso à escolha. O
`FiredOverlay` já estabelece o padrão de takeover em `Modal`.

Card em retrato: manchete, retrato do jogador, a situação em 2-3 frases, e as
opções empilhadas — cada uma com sua consequência em uma linha. Um `CtaButton`
vermelho para a ação principal, `GhostButton` para as outras, dentro do kit
existente. Sem inventar componente novo.

---

## Fases

**Fase 1 — encanamento + uma decisão de ponta a ponta.**
`types.ts`, `decisionService.ts`, bloqueio no `seasonRunner`/`App.tsx`, o modal,
e **só a decisão A** (cobrir ausência). Prova o caminho inteiro com a decisão
que mais dispara e que toca três sistemas.

**Fase 2 — B e C.** Inclui o conserto do limiar de moral, que é pré-requisito de
B e vale por si só (um sistema inteiro construído que nunca dispara).

**Fase 3 — personalidade.** É aqui que a camada de fantasia pedida lá no começo
finalmente encaixa: a personalidade do jogador não vira texto decorativo, vira
**como ele reage à sua escolha**. Sem a superfície de decisão, ela não tinha
onde grudar.
