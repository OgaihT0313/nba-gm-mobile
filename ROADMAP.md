# Roadmap / backlog

O que **ainda não foi feito**, em ordem de prioridade. Reescrito em 2026-09-10,
depois da rodada que calibrou o motor e construiu a fila de decisões — a lista
anterior tinha itens já entregues.

Histórico e raciocínio das decisões já tomadas: [PLANO-V2.md](PLANO-V2.md) e
[PLANO-DECISOES.md](PLANO-DECISOES.md). **Não iniciar nada daqui sem pedido
explícito do usuário.**

---

## 0. Rodar um APK — FEITO (2026-10-04)

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
Câmera nova "Perto" segue a bola. Não testado no celular: ~280 draw calls e
~250k triângulos, texturas montadas em ~120 ms (V8) ao abrir a tela.

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

## 4. Imprensa e storylines

O último item da camada de fantasia. Coletivas, manchetes, rivalidades, jogos de
revanche, marcos de carreira.

Ficou por último de propósito e continua fazendo sentido: ele precisava de uma
**superfície de decisão** pra grudar, e agora ela existe. A personalidade já
mostrou o caminho — o arquétipo não virou texto no card, virou como o jogador
responde à sua escolha. Imprensa tem que passar pelo mesmo teste.

**Restrição dura:** nada disso pode ser anunciado pelo feed `season.events`. O
buffer é de 50, a tela mostra 6, e uma offseason empurra centenas.

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
