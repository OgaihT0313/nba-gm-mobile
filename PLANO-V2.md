# NBA GM v2 — diagnóstico do motor + plano de refino

Escopo pedido pelo usuário (2026-09-08): calibrar a lógica da simulação e construir a
camada de **fantasia** (imersão/narrativa — não é fantasy draft nem fantasy points).
A terceira frente pedida na mesma conversa, refazer a UI/UX em paisagem travada, foi
construída, avaliada e **descartada** (2026-09-09) — ver abaixo.

---

## Fase 1 — Diagnóstico (FEITO)

Instrumento: [`scripts/diagnose_season.ts`](scripts/diagnose_season.ts). Roda o motor
fora do app (mesmo caminho de `check_watch_director.ts`), simula N temporadas de 82
jogos com os dados reais e compara a saída com faixas reais da NBA.

```
npx tsc scripts/diagnose_season.ts --ignoreConfig --ignoreDeprecations 6.0 \
  --outDir .check --module commonjs --target es2020 --moduleResolution node \
  --esModuleInterop --resolveJsonModule --skipLibCheck
cp -r data .check/data && node .check/scripts/diagnose_season.js 12
```

### Resultado (12 temporadas, 14.760 jogos)

| Métrica | Medido | Real (NBA) | |
|---|---|---|---|
| Melhor campanha | **72,9** | 58–68 | ✗ |
| Pior campanha | 13,3 | 12–22 | ok |
| Desvio-padrão de vitórias | **16,1** | 10–14 | ✗ |
| Times com 60+ vitórias | **4,5** | 0,5–3 | ✗ |
| Times com ≤20 vitórias | 2,67 | 0,5–3 | ok |
| Correlação talento × vitórias | 0,83 | 0,75–0,92 | ok |
| Pontos por time por jogo | **96,5** | 110–118 | ✗ |
| Desvio-padrão do placar | **7,1** | 11–14 | ✗ |
| Placar máximo em 14.760 jogos | **120** | 140–165 | ✗ |
| Margem média | **7,2** | 10,5–13 | ✗ |
| Vitórias em casa | **61,2%** | 52–60% | ✗ |
| Jogos decididos por ≤5 | **45,3%** | 22–30% | ✗ |
| Jogos com 20+ de margem | **2,4%** | 18–26% | ✗ |
| Placares travados no piso de 80 | **0,79%** | ~0% | ✗ |
| Cestinha (PPG) | 33,5 | 30–36 | ok |
| Líder de rebotes | **15,1** | 12–15 | ✗ |
| Líder de assistências | **12,4** | 9,5–12 | ✗ |
| Líder de roubos | **2,93** | 1,9–2,6 | ✗ |
| Líder de tocos | 3,16 | 2,5–4 | ok |
| Maior média de minutos | **43,8** | 34–38 | ✗ |
| Jogadores com 20+ PPG | 34,8 | 30–45 | ok |
| Jogos disputados médios | **81,0** | 60–78 | ✗ |

Distribuição de placares: p1=81, p50=96, p99=112. **A liga inteira cabe em 31 pontos.**

### Causa-raiz #1 — a variância é uniforme e estreita (explica 9 das 16 falhas)

`simulationService.ts:459` — `const variance = 15` aplicado como
`Math.random() * 15 - 7.5`. Uma uniforme de largura 15 tem desvio-padrão de
**4,3 pontos**. O placar real de um time na NBA tem desvio de ~12.

O efeito não é cosmético, é o jogo inteiro:

- Com ruído de 4 pontos, uma diferença de talento de 6 pontos **sempre** vence.
  Daí 72,9 vitórias no topo e 4,5 times com 60+ — a liga não tem zebras.
- Daí também 45% dos jogos decididos por ≤5 e só 2,4% de blowouts: todo placar
  cai colado na média.
- Daí o mando de quadra valer 61% de vitórias: 2,5 pontos fixos contra um ruído
  de 4,3 é uma vantagem enorme.
- Daí o piso de 80 pontos disparar (0,79% dos placares saem exatamente 80): a
  distribuição está tão comprimida perto de 96 que o clamp vira patamar visível.

Correção: variância gaussiana (soma de uniformes ou Box-Muller) com σ ≈ 11–12, e
remover o clamp em favor de um piso suave.

### Causa-raiz #2 — o nível de pontuação é de 1998

`simulationService.ts:424` — `baseScore = 98`. A liga marca 96,5 por jogo. A NBA
moderna marca ~114. Um placar de 118×112 é literalmente impossível hoje: o máximo
observado em 14.760 jogos foi 120.

Isso interage com #1: subir a base sem alargar a variância só desloca o mesmo
aglomerado estreito para cima.

### Causa-raiz #3 — 240 minutos divididos entre 8 jogadores

`TEAM_MINUTES = 240` (`simulationService.ts:751`) repartido pelos
`ROTATION_WEIGHTS` de uma rotação de 8 dá **43,8 mpg** ao titular principal.
Nenhum jogador da NBA moderna passa de ~37. Times reais usam 10–12 jogadores.

Consequência em cadeia: os líderes de rebote (15,1), assistência (12,4) e roubo
(2,93) estouram a faixa real porque cada um está jogando 20% mais minutos do que
deveria — os expoentes de `recordGameStats` já estão razoáveis, o que está errado
é o multiplicador de minutos.

### Causa-raiz #4 — ninguém se machuca

Média de **81,0 jogos disputados** por quem entra em rotação, num calendário de 82.
Na NBA real a média de um titular fica em ~65. `injuryRisk` existe e é bem
desenhado (idade × carga × fadiga), mas a taxa base em `handleRandomEvents` é
pequena demais para o sistema de load management ter qualquer significado — o
jogador nunca é forçado a escolher.

### Observação menor

`getGameRatings:225` sorteia **um** `formFluctuation` e aplica o mesmo valor ao
ataque e à defesa do jogador. Uma noite boa deveria poder ser ofensiva sem ser
defensiva.

---

## Fase 2 — Calibração (FEITO)

Arquitetura de "pontos esperados" mantida; os números corrigidos e medidos de novo
a cada passo. **De 16 métricas fora para 1** (30 temporadas, 36.900 jogos).

| | antes | depois | real |
|---|---|---|---|
| Pontos por time | 96,5 | **114,1** | 110–118 |
| Desvio-padrão do placar | 7,1 | **13,3** | 11–14 |
| Placar máximo em 15k jogos | 120 | **162** | 140–165 |
| Margem média | 7,2 | **11,7** | 10,5–13 |
| Jogos por ≤5 pts | 45,3% | **28,7%** | 22–30% |
| Blowouts (20+) | 2,4% | **18,1%** | 18–26% |
| Vitórias em casa | 61,2% | **56,8%** | 52–60% |
| Melhor campanha | 72,9 | **64,1** | 58–68 |
| Desvio de vitórias | 16,1 | **10,4** | 10–14 |
| Correlação talento × vitórias | 0,83 | **0,79** | 0,75–0,92 |
| Maior média de minutos | 43,8 | **37,3** | 34–38 |
| Jogos disputados médios | 81,0 | **60,2** | 60–78 |

O que mudou, e por quê:

1. **Variância gaussiana em duas partes** (`simulateGame`) — um swing de *ritmo*
   compartilhado pelos dois times (σ 7,8) mais a noite de arremesso de cada um
   (σ 9,0), via `gauss()` (Irwin-Hall, naturalmente limitada a ±3σ). Compartilhar
   parte da variância é o que mantém o desvio da margem abaixo de √2× o do placar
   — amostrar os dois lados de forma independente fabricaria blowouts.
2. **`baseScore` 98 → 115.**
3. **Piso de placar 80 → 50** — deixou de ser um patamar visível. `MIN_GAME_SCORE`
   no `watchDirector` acompanhou.
4. **`matchupStrength` 0,6 → 1,15** — a variância realista engoliu o sinal do
   talento e achatou a liga (melhor campanha caiu para 58, correlação para 0,66).
   Esse número é o lado do *sinal* na razão sinal/ruído de que a tabela inteira depende.
5. **Rotação 8 → 10 jogadores** (`ROTATION_MIN/MAX` 8/12), com `ROTATION_WEIGHTS`
   redesenhados a partir de uma distribuição real de minutos (36/34/32/30/28 …
   /24/20/16/12/8, dividida por 6). Corrigiu 43,8 mpg → 37,3.
6. **Lesões roladas por time, todo dia** (`INJURY_CHANCE_PER_TEAM = 0.18`).
   Antes era *um* time sorteado por dia a 2% — cerca de 1,6 lesões por temporada
   na liga inteira, o que tornava o load management decorativo. Só a lesão mais
   grave da noite vira mensagem, para não afogar o feed.
7. **`formFluctuation` sorteada duas vezes** — noite boa no ataque não implica mais
   noite boa na defesa.
8. **`LIVE_QUARTER_VARIANCE` 9 → 22 e `QUARTER_FLOOR` 16 → 10** — o Jogo 7 ao vivo
   era 5× mais determinístico que os jogos que o motor resolve no fundo. Agora um
   quarto tem σ≈6,3, que é o desvio do jogo inteiro dividido por quatro quartos.
9. **Taxa de assistências 0,22 → 0,19 dos pontos** — a coeficiente é uma fração
   dos pontos, então subir a pontuação para 114 tinha levado o time a ~30 assistências.
10. `advisorService` passou a ler a rotação real do time em vez de um 8 fixo.

Verificação: `scripts/diagnose_season.ts` (novo) e `scripts/check_watch_director.ts`
(existente, passando). `npx tsc --noEmit` limpo.

### Duas regressões que só apareceram rodando o app

O harness mede a liga, não a experiência. Rodar o app no navegador em paisagem
pegou duas coisas que a calibração quebrou e nenhuma métrica acusaria:

- **O feed virou 100% lesão.** Com ~4,5 lesões por noite na liga e um único
  slot de mensagem por dia, a lesão ganhava todos os dias — trocas, sequências
  quentes, má fase e química continuavam disparando e sendo sobrescritas.
  Agora só duas categorias viram notícia: qualquer lesão **no seu time**, e
  lesão grave (18+ jogos) de jogador 85+ em qualquer lugar. As ausências todas
  continuam valendo; o resto se lê nas telas de elenco.
- **O dono pedia demissão no sétimo jogo.** `projectConfidence` extrapolava a
  campanha direto para 82 jogos: um 2-5 virava projeção de 23 vitórias e
  derrubava a confiança para 6% ("beira da demissão") — com o elenco intacto e
  75 jogos pela frente. Sobrevivia enquanto o motor quase não tinha variância e
  um bom time praticamente nunca começava 2-5; com placar de verdade isso é
  rotina. Agora a projeção regride à meta do dono por tamanho de amostra
  (`PRIOR_GAMES = 20`): o mesmo 2-5 dá 46%, e um 7-7 dá 54%. O julgamento de
  fim de temporada continua usando o retrospecto real, sem suavização.

Também trocado no harness: "placar mínimo/máximo observado" virou **percentil**
(p0.1 / p99.9). O extremo de uma amostra não é propriedade do modelo — quanto
mais temporadas você roda, mais alto o máximo sobe, então a métrica só passava
alargando a faixa, o que não mede nada. O clamp continua vigiado pela métrica de
"placares travados no piso".

### A última métrica — resolvida com tanking da CPU (2026-09-09)

**Times com ≤20 vitórias: 0,38 por temporada, contra 1–3 na NBA real.** O fundo da
liga não afundava: o pior time ganhava ~22 jogos onde times reais chegam a 14.

Nunca foi problema de variância — era uma **decisão ausente**. Times reais são tão
ruins porque **escolhem** ser: sentam veteranos, jogam calouros, tankam por posição
no draft. O motor não tinha isso, e forçar o número subindo `matchupStrength`
estouraria o topo.

**Implementação** (`decideTanking` + `shutDownIds`, `simulationService.ts`):

- No **prazo de trocas** (jogo 55, o mesmo momento em que uma diretoria real
  decide se compra ou vende), os times em 13º ou pior na conferência desistem da
  temporada. 13º de 15 deixa de fora os três que estão realmente eliminados — o
  play-in ainda alcança o 10º, então 11º e 12º seguem jogando por algo.
- Um time tankando **senta seus dois melhores jogadores** pelo resto da temporada.
  Não é "tentar menos": é tirar de quadra quem ganha jogos. Dois é de propósito —
  o terceiro melhor de um time ruim já é nível de reposição, e sentar mais
  achataria todos os tankers no mesmo piso.
- **O payoff sai de graça.** `runPlayerProgression` lê `mpg` como oportunidade de
  desenvolvimento, então os minutos que sobram desenvolvem de verdade quem os
  absorve. Tanking custa vitórias e compra posição no draft **e** evolução.
- **Nunca no time do usuário.** Tankar é decisão de GM, e o usuário é o GM.

**Medido** (`scripts/diagnose_season.ts`, 40 temporadas / 49.200 jogos):

| | antes | depois | real |
|---|---|---|---|
| Times com ≤20 vitórias | 0,38 | **0,88** | 0,5–3 |
| Pior campanha | 22,4 | **19,1** | 12–22 |
| Desvio-padrão de vitórias | 10,5 | **11,4** | 10–14 |
| Melhor campanha | 63,5 | **64,4** | 58–68 |

**0 de 23 métricas fora da faixa real.**

Comportamento conferido à parte (8 temporadas): 5,8 times tankando por temporada,
o time do usuário marcado **zero** vezes, ritmo de vitória caindo de .31 para .27
após o prazo (contra .55 → .56 de quem não tanka), e jogadores de menos de 24 anos
com **22,1 mpg** em times tankando contra 19,1 nos demais — o payoff de
desenvolvimento é real, não presumido.

**Pendência de UI:** hoje o tanking é invisível. O usuário vê a tabela mudar mas
não vê que o Wizards sentou suas duas estrelas — e pode negociar com um time em
liquidação sem saber. Falta uma marca em `TeamsList`/`TeamDetail` ("Em
reconstrução") e, idealmente, a **oferta da decisão ao próprio usuário**, que é a
metade da mecânica que o motor deliberadamente não toma por ele.

### Duas regressões que só apareceram rodando o app

O harness mede a liga, não a experiência. Rodar o app no navegador em paisagem
pegou duas coisas que a calibração quebrou e nenhuma métrica acusaria:

- **O feed virou 100% lesão.** Com ~4,5 lesões por noite na liga e um único
  slot de mensagem por dia, a lesão ganhava todos os dias — trocas, sequências
  quentes, má fase e química continuavam disparando e sendo sobrescritas.
  Agora só duas categorias viram notícia: qualquer lesão **no seu time**, e
  lesão grave (18+ jogos) de jogador 85+ em qualquer lugar. As ausências todas
  continuam valendo; o resto se lê nas telas de elenco.
- **O dono pedia demissão no sétimo jogo.** `projectConfidence` extrapolava a
  campanha direto para 82 jogos: um 2-5 virava projeção de 23 vitórias e
  derrubava a confiança para 6% ("beira da demissão") — com o elenco intacto e
  75 jogos pela frente. Sobrevivia enquanto o motor quase não tinha variância e
  um bom time praticamente nunca começava 2-5; com placar de verdade isso é
  rotina. Agora a projeção regride à meta do dono por tamanho de amostra
  (`PRIOR_GAMES = 20`): o mesmo 2-5 dá 46%, e um 7-7 dá 54%. O julgamento de
  fim de temporada continua usando o retrospecto real, sem suavização.

Também trocado no harness: "placar mínimo/máximo observado" virou **percentil**
(p0.1 / p99.9). O extremo de uma amostra não é propriedade do modelo — quanto
mais temporadas você roda, mais alto o máximo sobe, então a métrica só passava
alargando a faixa, o que não mede nada. O clamp continua vigiado pela métrica de
"placares travados no piso".

### A métrica que sobrou — e por que não foi forçada

**Times com ≤20 vitórias: 0,33 por temporada (real: 1–3).** O fundo da liga não
afunda: o pior time ganha ~22 jogos, quando na NBA real times reais chegam a 14.

Não é problema de variância — é comportamento ausente. Times reais são tão ruins
porque **escolhem** ser: sentam veteranos, jogam calouros, tankam por posição no
draft. O motor não tem tanking nenhum, e forçar o número subindo `matchupStrength`
estouraria o topo (a melhor campanha já está em 64,1, teto 68).

Vira feature, não ajuste: **CPU que tanka** — um time eliminado matematicamente
encurta a rotação dos veteranos, aumenta os minutos dos jovens e piora de
propósito. Encaixa naturalmente na Fase 4 (é uma decisão de front office com
narrativa própria) e conserta a métrica pelo motivo certo.

## Fase 3 — Paisagem: tentada e revertida

Construída em 2026-09-09 e **descartada no mesmo dia** — o usuário rodou e não
gostou do resultado. O app voltou para retrato.

O que foi feito e desfeito: `orientation: "landscape"` no `app.json`, status bar
escondida, um `components/ui/Stage.tsx` (hero virando coluna fixa, colunas com
scroll independente, sem scroll de página), um `components/SideRail.tsx`
substituindo a `BottomNav` (rail auto-limitante de 9 slots, gaveta calculada), e
a `SimulationScreen` recomposta em três colunas. O `Screen.tsx` retrato tinha
ficado marcado como transitório, com clamps de largura/altura para as 14 telas
não convertidas.

A reversão foi cirúrgica: `BottomNav.tsx`, `Screen.tsx` e `app.json` voltaram
byte a byte ao HEAD; `App.tsx` e `SimulationScreen.tsx` ficaram no HEAD **menos**
as remoções de IA. Nada da Fase 2 (calibração) foi tocado.

Os arquivos descartados foram guardados fora do repo, em
`…/scratchpad/landscape-descartado/` (`Stage.tsx`, `SideRail.tsx`,
`SimulationScreen.landscape.tsx`), caso valha reaproveitar alguma ideia.

**O que sobrou de aprendizado, se a UI voltar a ser mexida em retrato:**

- A tela de Simulação em retrato mostra uma coisa de cada vez: o hero com a
  identidade do time rola para fora assim que você lê qualquer outra coisa. Esse
  era o problema que a coluna fixa resolvia — e continua valendo em retrato, só
  precisa de outra solução (um header compacto que gruda, por exemplo).
- A `BottomNav` tem 4 abas e uma gaveta "Mais" com nove seções. Draft e Agência
  Livre ficam na gaveta mesmo na noite do draft, que é quando são a única coisa
  que importa. Dá para consertar isso sem mudar de orientação: promover a fase
  aberta para a barra, no lugar de uma aba menos usada.
- O `MyTeamHub` reportava um "9 jogadores no giro" hardcoded que já estava errado
  antes de qualquer mudança de layout — hoje lê o `DEFAULT_ROTATION_SIZE` real.
  Essa correção ficou.

## Integração de IA — removida

Decisão do usuário (2026-09-08): as duas narrações geradas por LLM custavam até
três tentativas de 12s antes de estourar, para poucas frases de tempero. A
integração inteira saiu — `services/geminiService.ts`, o proxy Cloudflare, a
`EXPO_PUBLIC_AI_PROXY_URL` no `eas.json`/`.env`/`.env.example`. O projeto não
faz mais **nenhuma** chamada de rede.

O que aconteceu com cada uma das duas:

- **Reação do GM na troca — mantida, agora instantânea.** As doze linhas
  escritas à mão que existiam como fallback offline já conheciam a situação
  competitiva do parceiro (contender/bubble/reconstrução) e nomeavam os
  jogadores envolvidos, que era a parte que carregava o sentido. Viraram a
  única fonte. É a resposta do GM adversário à sua proposta — sem ela uma
  recusa não dá motivo nenhum.
- **"Da cabine" — removida.** O painel existia só para exibir o texto do
  modelo; sem ele sobrava um único template determinístico repetindo a mesma
  frase a temporada toda. `CommentaryPanel.tsx` e o campo
  `SeasonState.leagueCommentary` foram deletados junto.

## Dependências / Hermes — resolvido (2026-09-09)

`expo-doctor` acusava 2 de 21 checks falhando: a regressão de memória do Hermes V1
(o projeto estava em `expo@57.0.4`, Hermes `…0.14`; a correção veio na `…0.16`) e
11 pacotes atrás do que o SDK 57 espera. O sintoma esperado era o app engasgar ou
fechar em sessão longa **no aparelho** — invisível no navegador.

Corrigido com `npx expo install expo@^57.0.9 --fix` seguido de um segundo
`npx expo install --fix` (a primeira passada sobe o `expo`, a segunda alinha o
resto contra a versão nova). **21/21 checks passam.**

| | antes | depois |
|---|---|---|
| expo | 57.0.4 | 57.0.21 |
| react-native | 0.86.0 | **0.86.3** (Hermes corrigido) |
| @expo/metro-runtime | 57.0.3 | 57.0.15 |
| expo-image | 57.0.0 | 57.0.4 |
| expo-dev-client | 57.0.6 | 57.0.18 |
| expo-splash-screen | 57.0.4 | 57.0.8 |
| expo-status-bar | 57.0.0 | 57.0.1 |
| expo-audio | 57.0.3 | 57.0.4 |

Verificação: `tsc --noEmit` limpo, `check_watch_director.ts` passando,
`diagnose_season.ts` estável, app carregando no navegador sem erro de console.

### `darkMode: 'class'` no tailwind.config.js

O app subia com dois erros de console. Testei com o lockfile antigo (`npm ci` na
versão anterior) e **os dois já existiam antes do upgrade** — nenhum é regressão:

- **`Cannot manually set color scheme, as dark mode is type 'media'`** — real. O
  runtime web do NativeWind instala um MutationObserver no `<html>` que chama o
  próprio setter de colorScheme, e esse setter lança sob o `darkMode: 'media'`
  padrão do Tailwind. Corrigido com `darkMode: 'class'`, que é seguro aqui: o app
  é dark fixo (`userInterfaceStyle: "dark"`) e **não usa nenhuma variante `dark:`**.
  Só afeta web — o APK nunca empacota esse runtime.
- **`Unable to resolve module expo`** — artefato de overlay do Metro durante o
  rebuild de cache. Some num carregamento limpo; o log do Metro nunca reportou.

## Fase 4 — Fantasia (imersão / narrativa)

> **Pré-requisito descoberto depois:** ver [PLANO-DECISOES.md](PLANO-DECISOES.md).
> Medido, o jogo pede uma decisão do usuário ~2 vezes por temporada de 82 jogos.
> Sem uma superfície de decisão, personalidade e imprensa viram texto decorativo
> no mesmo feed que já engole tudo. A fila de decisões vem antes.


O que o usuário chamou de "fantasy": a sensação de ser um GM de verdade.
Duas dessas ideias já estavam mapeadas no `ROADMAP.md` e foram adiadas.

- **Vestiário / personalidade** — arquétipos (líder, estrela, prodígio, mentor,
  workhorse, imprevisível) que mudam como moral e química reagem. Já existe
  `morale` e `teamChemistry`; falta a personalidade que os torna legíveis.
- **Imprensa e storylines** — coletivas, manchetes, rivalidades, jogos de
  revanche, marcos de carreira, narrativas de sequência.
- **Substituições e fadiga ao vivo** no jogo assistido (`watchDirector.ts`,
  `PlayerState[]` / `buildFive` são o ponto de entrada exato).

**Restrição dura, aprendida na marra:** nada importante pode ser anunciado pelo
feed `season.events`. O buffer é de 60, a tela mostra 6, e uma offseason empurra
centenas de eventos em três etapas. Todo painel narrativo tem que ser **derivado
do estado**, com espaço próprio — como o banner de "Nova era" em
`SimulationScreen.tsx`.
