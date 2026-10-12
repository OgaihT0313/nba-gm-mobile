# Roadmap / backlog

O que **ainda não foi feito**, em ordem de prioridade. Reescrito em 2026-09-10,
depois da rodada que calibrou o motor e construiu a fila de decisões — a lista
anterior tinha itens já entregues.

Histórico e raciocínio das decisões já tomadas: [PLANO-V2.md](PLANO-V2.md) e
[PLANO-DECISOES.md](PLANO-DECISOES.md). Sessão de 6 a 8/10/2026 (redesign, NBA Manager,
dados reais, teste no celular): [SESSAO-2026-10-06.md](SESSAO-2026-10-06.md). **Não iniciar nada daqui sem pedido
explícito do usuário.**

---

## Prioridades a partir de 2026-10-10

Feito depois da análise "o que é inútil / o que lapidar / o que falta". Os cortes
já entraram (código morto, feed só do seu time, avisos filtrados, troca da CPU
sem o time do usuário). O resto, em ordem. **L** = lapidar algo que existe,
**N** = coisa nova.

| # | Item | Tipo | Tamanho | Por que nessa posição |
|---|------|------|---------|------------------------|
| 1 | Salvar e carregar a carreira — **FEITO** | N | M | Sem isso nada mais importa: fechar o app perde a carreira inteira |
| 2 | 3D — Etapas 0 e 4b (medição + ritmo da partida) — **FEITO** | L | M | Já aprovado; sem ritmo, o resto do 3D passa despercebido |
| 3 | Ratings de veteranos no pipeline — **FEITO** (2026-10-12) | L | P | Erro de dado visível (McConnell OVR 88 aos 34) e barato de corrigir |
| 4 | Redesign do celular (handoff do Claude Design) | L | G | O usuário está insatisfeito com a UI; o PC já recebeu o redesign |
| 5 | Histórico da liga e da franquia | N | M | Dá peso aos saves longos, que o item 1 torna possíveis |
| 6 | Eras no modelo do Basketball-Reference | L | M | 41 eras ainda com ratings antigos e salários sintéticos |
| 7 | Desenvolvimento ativo de jogadores | N | M | Hoje a evolução é toda passiva; vira decisão de GM |
| 8 | 3D — Etapas 1 a 8 restantes — **FEITO** (2026-10-11) | L | G | Segue o PLANO-3D, uma etapa por vez |
| 9 | Jogo decisivo dentro do 3D | L | M | Junta as duas telas de jogo; depende das etapas 4-5 do 3D |
| 10 | Objetivos e conquistas de GM | N | P | Meta para saves longos além de "ganhar o título" |
| 11 | Staff além do técnico | N | G | Profundidade, mas mexe em muitos sistemas calibrados |
| 12 | Ajustes técnicos menores | L | P | Erosão da liga e `diagnose_season` |

Tamanho: P = um dia ou menos, M = alguns dias, G = uma semana ou mais.

### 1. Salvar e carregar a carreira (N) — FEITO, 1 espaço (2026-10-10)

`services/saveService.ts` (formato, versão, migrações) sobre `saveStorage.ts`
(celular: arquivo em `Paths.document`, gravado via arquivo temporário) e
`saveStorage.web.ts` (`localStorage`). O `App.tsx` carrega o save ao abrir e grava
a cada mudança (400 ms de espera; durante a simulação, no máximo a cada 5 s e ao
parar). A Home já mostrava "Carreira salva" / "Continuar"; "Assinar como GM" avisa
que substitui o save, e a tela de erro ganhou "Apagar carreira salva e recomeçar".
Medido: ~0,55 MB por save; duas temporadas com ida e volta pelo JSON a cada dia e
em cada etapa da offseason sem perda. **Falta:** testar no APK (só o web foi
testado) e, se quiser, 2-3 espaços. Notas originais abaixo.

O app não guarda nada: o `expo-file-system` já está nas dependências, mas nenhum
arquivo do jogo usa. `SeasonState` já é um objeto serializável (o estado inteiro
vive num `useState` do `App.tsx`).
- Salvamento automático ao fim de cada dia simulado (com intervalo mínimo) e em cada
  etapa da offseason; "Continuar" na tela inicial.
- 1 a 3 espaços de save, com time, temporada e campanha no card.
- `saveVersion` no arquivo, com migração, porque o formato vai mudar com os próximos
  itens.
- Web: `localStorage` (ou IndexedDB, se o tamanho estourar); celular: arquivo via
  `expo-file-system`. Medir o tamanho do JSON numa carreira de 10 anos antes de
  escolher.
- Não salvar no meio do jogo ao vivo ou do 3D: salvar no estado anterior ao jogo.

### 2. 3D — Etapas 0 e 4b (L) — FEITO na branch `melhoria-3d` (2026-10-10)

Junto com o item 8: **todas as etapas do 3D (0-8) feitas e testadas no aparelho**
(2026-10-11). Detalhes, números e a decisão do usuário de manter o desempenho atual em
[PLANO-3D.md](PLANO-3D.md). Juntada na `redesign-console-mygm` em 2026-10-11 (`2226c4d`).

### QA no aparelho — FEITO (2026-10-11, commit `d49c9fd` na `melhoria-3d`)

Percurso completo no Galaxy A57 por adb: todas as abas, trocas (proposta e recebida),
temporada com decisões e coletivas, playoffs até o título, draft, agência livre, save
fechando o app, jogo 3D com tempo, substituição, 4X e pular. Log sem erro de JS, ANR
ou crash. Corrigidos: 6º homem indo para titular lesionado (229 de 240 sorteios),
"promover jovem" em lesão de reserva tirando um titular, aviso do prazo chamando o
líder de "zona de play-in", 3D com metade preta depois do pedido de tempo, câmera não
lembrada entre jogos, folha salarial cortada em Meu Time, botões dos playoffs
quebrando linha, nomes de calouros repetidos. Observação não corrigida: os efeitos
sonoros aparecem como player de mídia no Android (não deveriam pausar música de outro
app — `mixWithOthers` é o padrão —, mas não confirmado). As correções e o modo
claro/escuro (`11f8cb3`) entraram no APK de 2026-10-12 (build EAS `fbeae856`).

### 3. Ratings de veteranos (L) — FEITO (2026-10-12)

O caso que abriu o item (T.J. McConnell 88 aos 34) já tinha sido corrigido pela
passada do Basketball-Reference de 2026-10-06 (ele estava 82). O que sobrava não era
idade, era amostra pequena: reservas com poucos minutos e BPM quente ao lado de
titulares (Paul Reed 84 com 13,9 min, Thybulle e Toppin 82 com ~450 min).
`apply_bbref.py` agora ordena o OVR com o BPM regredido mais forte (`K_RANK` 1000 em
vez de 500) e o peso de minutos subiu de 0,08 para 0,12. off/def não mudam (o motor
transforma eles em pontos). 284 OVRs mudaram de −4 a +5; o top 12 é o mesmo.
Backtest: força do elenco x vitórias reais r 0,818 → 0,879, vitórias simuladas
0,816 → 0,830, todas as linhas de jogador melhores; OVR x BPM 0,918 → 0,882 (o efeito
pretendido: menos peso para BPM de pouca amostra). Ficou exposto um limite do motor,
ver item 12: jogadores com 20+ PPG caíram de ~30,5 para ~29,5 (piso do portão 30).

### 4. Redesign do celular (L)

Aplicar no celular o que o handoff do Claude Design definir, reaproveitando o padrão
do PC (`useDesktop`, painéis compartilhados). Não refazer a navegação inteira: a
tentativa de paisagem já foi descartada (ver "O que eu não faria").

### 5. Histórico da liga e da franquia (N)

Hoje existe só o `awardHistory` (prêmios por temporada) e as carreiras. Falta:
- campeões e vices ano a ano, com a campanha;
- recordes da franquia e da liga (temporada e carreira), alimentados pelos totais que
  `careerService` já acumula;
- Hall da Fama na aposentadoria (`retirementService`), com critério de títulos,
  prêmios e totais;
- camisas aposentadas no time do usuário, como decisão dele.

### 6. Eras no modelo novo (L)

Levar o `fetch_bbref.py` → `apply_bbref.py` às temporadas das eras (o BBRef tem BPM
desde 1973-74), com salários reais ou derivados do teto da época. Conferir com
`scripts/check_eras.ts`.

### 7. Desenvolvimento ativo (N)

Foco de treino por jogador (arremesso, defesa, físico), minutos prometidos a um
jovem que viram promessa cobrada como a da coletiva, e o técnico de desenvolvimento
pesando mais. Precisa passar pelo mesmo teste da imprensa: tem que virar número que
o motor lê. Re-medir a curva de evolução com `check_contracts`.

### 8. 3D — Etapas 1 a 8 restantes (L)

Ver [PLANO-3D.md](PLANO-3D.md). Confirmar com o usuário ao fim de cada etapa.

### 9. Jogo decisivo no 3D (L)

O jogo decisivo dos playoffs usa a `LiveGameScreen` (por quartos), e os outros jogos
usam a `WatchGameScreen` (3D). Levar timeouts e as 3 táticas do decisivo para o
huddle do 3D e apagar a tela por quartos. Decidido em 2026-10-10: só depois do 3D.

### 10. Objetivos e conquistas de GM (N)

Metas de carreira derivadas do estado (dinastia, reconstrução em X anos, MVP
draftado por você, título com folha abaixo do teto) e uma tela de conquistas.
Tudo derivado; nada pelo feed.

### 11. Staff além do técnico (N)

Assistentes, preparador físico (risco de lesão e carga) e olheiros (precisão do
relatório do draft). É grande porque cada um mexe num sistema já calibrado:
re-medir `check_coaches` e `diagnose_season`.

### 12. Ajustes técnicos menores (L)

- Erosão lenta do OVR do topo da liga depois do 7º ano (ver "Aposentadoria" abaixo).
- `diagnose_season.ts` não responde às decisões.
- Pontuação achatada: a NBA real de 2025-26 teve **46** jogadores com 20+ PPG e
  cestinha com 33,5; a sim dá ~29,5 e ~30. Os pontos são usage × TS × minutos, então
  a causa é a divisão de minutos (MPG viés −1,3, líder 36 vs 38), não os ratings. O
  portão do `diagnose_season` (piso 30) está falhando por ~0,5 desde o item 3.
- `check_decisions` é instável: com 12 temporadas, o p95 é o máximo, e "pedido de
  troca dispara" falha às vezes também nos dados antigos.

---

## 0. Rodar um APK — FEITO (2026-10-04)

Último APK testado pelo usuário: `609f0b0c` (tudo até `3e07c3f` — item 4
completo, elencos 2026-27, 3D novo), sem problemas.

**Ratings, salários e simulação recalibrados contra a temporada real (2026-10-06)**,
a pedido do usuário. Com 2025-26 encerrada, o pipeline (`nba-gm-simulator/pipeline`:
`fetch_bbref.py` → `export_reality.py` → `apply_bbref.py --ratings --salaries --teams`)
lê o Basketball-Reference e:
- **OVR/off/def** vêm do BPM/OBPM/DBPM reais, regredidos por minutos (com 2024-25
  como base para quem se machucou). off/def são lineares no BPM; o OVR usa a
  mesma distribuição de antes, só reordenada. OVR x BPM real: 0,85 → 0,96.
- **Salários reais** de 2025-26, anos restantes reais e extensões já assinadas
  em `nextSalary`; curva de mercado (`expectedSalary`) reajustada nos salários
  reais, sem desconto de juventude.
- **Uso (USG%) e aproveitamento (TS%) reais** em `Player.usage/ts`; os pontos de
  cada jogador saem de uso × TS × minutos (explica 99,7% do real).
- Motor: `matchupStrength` 1,15 → 1,8 (nova escala de off/def), modificadores
  de perfil do elenco a 35% (contavam em dobro o que o BPM mede), tocos mais
  concentrados.
- Medido em `scripts/backtest_season.ts` (vitórias sim x reais r 0,45 → 0,80;
  força do elenco x vitórias reais 0,42 → 0,79; PPG r 0,79 → 0,82) e
  `scripts/check_coaches.ts` (técnico elite +8,7 vitórias, fraco −6,2, contra
  um neutro). `diagnose_season` 0 de 23 fora da faixa.
- Visual (mesmo dia): rosto do jogador no Scout (`PlayerFace`), sigla + escudo +
  nome nas listas de times (`TeamLogo`), escudo translúcido no topo de Confirmar,
  troféu (silhueta Larry O'Brien, `components/Trophy.tsx`) sobre as Finais. Eras checadas em
  `scripts/check_eras.ts` (continuam no formato real).
- Pendente: as **eras** ainda usam o modelo antigo de rating e salários
  sintéticos; o BBRef tem BPM desde 1973-74, então dá para levar o mesmo
  tratamento a elas.

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

## 4c. Correções do teste no celular (adb) — FEITO (2026-10-07)

Percurso completo no Galaxy A57 pelo adb, sem nenhum erro de JS ou travamento.
Corrigidos, na ordem de gravidade:
1. Draft: o destaque troca de jogador depois de "Observar". Agora fica preso no observado, e o botão diz o nome.
2. Câmeras na tela em pé seguem o centro da jogada e acompanham mais.
3. Uniforme branco para o visitante quando as cores colidem.
4. Salário do time atual, não do maior pagador (Clarkson: buyout do Utah).
5. OVR ranqueado por BPM + uso + minutos (Booker voltou a titular); off/def continuam BPM puro.
6. Calouro do Ano limitado a até 24 anos.
7. Posição na conferência no Meu Time usa os mesmos desempates da Classificação.
8. Motivo de troca bloqueada mostrado por inteiro.
9. Pico de OVR coerente com o OVR atual.
10. Sigla do piso desvirada no celular: o expo-gl ignora o `pixelStorei`.
11. Seleção de franquia ordenada pelo número mostrado; escudos com fundo claro.
12. Parceiros de troca com escudo e em ordem alfabética; botão "Pronto" na folha.
13. Ritmo só depois de 5 jogos; barra de chance com cores distintas.
14. Plural de "jogo", etiquetas de playoff só depois de 10 jogos, "Final/FIM" duplicado.

`matchupStrength` 1,75. Backtest: vitórias r 0,80, força x reais 0,82, PPG 0,86, MPG 0,64.

## 5. Melhoria do 3D — FEITO (2026-10-11; aprovado pelo usuário em 2026-10-06)

Plano completo em [PLANO-3D.md](PLANO-3D.md), reescrito em cima do código atual
de `components/court3d/`. Etapas:
- 0: branch `melhoria-3d` e medição de referência
- 4b: ritmo da partida (transições com tempo real, compacto de posses)
- 1: piso e marcações oficiais
- 2: iluminação de arena simulada (APK #1)
- 3: tabela, aro e rede
- 4: jogadores com `action` vinda do `watchDirector` (APK #2)
- 5: placar e relógios ao vivo
- 6: bola
- 7: câmeras
- 8: desempenho

Regras:
- fora do 3D, só acréscimos opcionais em `watchDirector.ts` e na `WatchGameScreen`;
- os 5 modos de câmera continuam;
- nenhuma sombra em tempo real por padrão.

Depois do teste no celular (2026-10-07), entrou a **Etapa 4b (ritmo da partida)**, logo depois da 0. Os jogadores atravessam a quadra em menos de meio segundo e a câmera filma o vazio; sem ritmo jogável, o resto passa despercebido. Também entrou o restante das câmeras na tela em pé (Etapa 7).

**Começar pela Etapa 0** e confirmar com o usuário ao fim de cada etapa.

## Menor, ou fora de escopo por decisão

- **Feed ainda é 62% lesão — RESOLVIDO de outro jeito (2026-10-10).** O feed e os
  avisos na tela passaram a mostrar só o time do usuário (`Event.teamIds`), então o
  ruído de lesão da liga sumiu sem mexer no balanceamento. De quebra: as trocas
  aleatórias de prazo da CPU não pegam mais o time do usuário (`5befd04`, `3522743`).
- **Aposentadoria + curva de evolução — FEITO (2026-10-04).** Não havia
  aposentadoria e a liga envelhecia: o top-8 médio caía 4,5 de OVR em 10 anos.
  Medindo por faixa de idade apareceu a causa real — os calouros chegavam a ~68
  e não evoluíam (a evolução dependia quase só de minutos, que calouro não tem)
  e quem tinha 24-28 ganhava ~+0,1 por ano. `retirementService.ts` aposenta
  ~37 por temporada (painel próprio na tela de Simulação, nunca o feed), e a
  curva em `runPlayerProgression` foi recalibrada. Em 10 anos: top-100 86,4 →
  85,6 (era 86,0 → 81,7), top-8 81,9 → 80,0. Resta uma erosão lenta depois do
  7º ano; o `check_contracts` tem portão para ela não voltar a crescer.
- **Ratings de veteranos no pipeline — FEITO (2026-10-12),** ver item 3 acima.
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
