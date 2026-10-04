# Roadmap / backlog

O que **ainda não foi feito**, em ordem de prioridade. Reescrito em 2026-09-10,
depois da rodada que calibrou o motor e construiu a fila de decisões — a lista
anterior tinha itens já entregues.

Histórico e raciocínio das decisões já tomadas: [PLANO-V2.md](PLANO-V2.md) e
[PLANO-DECISOES.md](PLANO-DECISOES.md). **Não iniciar nada daqui sem pedido
explícito do usuário.**

---

## 0. Rodar um APK — o único risco não verificado

Não é feature, é a única coisa aberta que pode estar quebrada agora. A correção
da regressão de memória do Hermes V1 (commit `806f0d2`) tem como sintoma o app
engasgar ou fechar **em sessão longa no celular**, e isso não aparece no
navegador. Tudo que foi verificado nesta rodada foi web.

```
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
```

Não faz pergunta nenhuma (conta e keystore já existem). ~10-15 min.

---

## 1. Ciclo de contratos — FEITO (2026-10-04)

Ver [PLANO-CONTRATOS.md](PLANO-CONTRATOS.md). Teto flexível com os números
reais de 2025-26, preço de mercado em todo contrato novo, direito de renovação,
exceção de nível médio, mercado que esfria, extensão na fila de decisões e
imposto cobrado pelo dono. Medido em `scripts/check_contracts.ts`.

Sobra: **dinheiro morto ao dispensar** (dispensar ainda apaga o salário).

## 2. Substituições e fadiga ao vivo no "Assistir ao Jogo"

Hoje os cinco titulares jogam os 48 minutos. `PlayerState[]` e `buildFive`
(`services/watchDirector.ts`) são o ponto de entrada exato; "Pedir tempo" já
existe.

Subiu de prioridade porque **agora o banco tem motivo pra existir**: lesões são
reais (~4,1 no seu elenco por temporada), `load` alimenta `injuryRisk`, e o
arquétipo Guerreiro já diferencia quem aguenta carga. É também a parte mais
vistosa do app. Item grande — merece plano próprio antes de começar.

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
- **Não existe aposentadoria.** Achado do `check_contracts`: o top-8 médio da
  liga cai de 81,6 para 78,6 em 8 temporadas, a folha mediana acompanha
  ($192M → $150M) e o pool de agentes livres cresce ~40 jogadores fracos por
  ano. Aposentar veteranos (idade + queda de OVR) estabilizaria as três coisas.
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
