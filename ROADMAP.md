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
| 4 | ~~Redesign do celular~~ — **RISCADO** (2026-10-12) | L | G | Já tinha acontecido: redesign "Transmissão" em 5-6/10 (`1705823`..`7171561`) |
| 5 | Histórico da liga e da franquia — **FEITO** (2026-10-12) | N | M | Dá peso aos saves longos, que o item 1 torna possíveis |
| 6 | Eras no modelo do Basketball-Reference — **FEITO** (2026-10-12) | L | M | 41 eras ainda com ratings antigos e salários sintéticos |
| 7 | Desenvolvimento ativo de jogadores — **FEITO** (2026-10-12) | N | M | Hoje a evolução é toda passiva; vira decisão de GM |
| 8 | 3D — Etapas 1 a 8 restantes — **FEITO** (2026-10-11) | L | G | Segue o PLANO-3D, uma etapa por vez |
| 9 | Jogo decisivo dentro do 3D — **FEITO** (2026-10-12) | L | M | Junta as duas telas de jogo; depende das etapas 4-5 do 3D |
| 10 | Objetivos e conquistas de GM — **FEITO** (2026-10-12) | N | P | Meta para saves longos além de "ganhar o título" |
| 11 | Staff além do técnico — [PLANO-STAFF.md](PLANO-STAFF.md), aprovado 2026-10-15; **fase 1 feita e medida** (falta testar no aparelho) | N | M | Profundidade, mas mexe em muitos sistemas calibrados |
| 12 | Ajustes técnicos menores — **FEITO** (2026-10-12, menos o `diagnose_season`) | L | P | Erosão da liga e `diagnose_season` |
| 13 | Minha Carreira (modo novo, separado do GM) — [PLANO-CARREIRA.md](PLANO-CARREIRA.md); **fase 1 FEITA** (2026-10-13, `14ab9a7`) | N | G | Pedido do usuário (2026-10-12): criar um jogador, ser draftado, momentos de decisão no jogo; liga atual e eras |

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

### QA no aparelho 2 — FEITO (2026-10-12, APK `6aac76ad`)

Percurso no Galaxy com a carreira de teste do Thunder: modo claro, Treino/promessa,
Legado, temporada inteira com decisões e coletivas, playoffs com **Jogo 7 das Finais
no 3D** (tática, pular, coroação), draft, mercado. Log sem crash, ANR ou erro de JS
(só avisos de biblioteca: `THREE.Clock`, `pixelStorei` do EXGL). Corrigido depois:
- Legado ignorava as temporadas de antes do histórico (bicampeão aparecia 1/2):
  títulos agora vêm do `awardHistory` (`seasonEntries`), e a aba Temporadas lista as
  antigas como "campanha não registrada".
- Prêmios dizia "Temporada 1" na temporada 2.
- Draft: classes geradas fracas demais (o nº 1 abaixo do 9º calouro real de 2025) —
  calouro do ano com 5,6 pts. Curva nova `66 + 15·e^(−slot/8)` (~81 no nº 1, ~71 no
  10º); o reforço de evolução jovem do item 7 foi desfeito na mesma medida (top-100
  estável em 12 anos, 86,2 → 86,0-86,7; calouro do ano 11-17 pts). Faixa de projeção
  presa a 60-99 (mostrava "43-67").
- Resultado da promessa de minutos ia para o feed e sumia: agora é painel na tela da
  temporada (`lastMinutesPromise`), e o cartão mostra o progresso (min/jogo até agora)
  e como cumprir.
- Placar do 3D dizia "Assistir ao jogo" no Jogo 7; coletiva repetida na mesma
  temporada tinha o mesmo texto palavra por palavra.
Conferido no aparelho com o APK `6ca806ae`: Legado com o título da T1 (bicampeão
desbloqueado, T1 "campanha não registrada"), "Temporada 3" nos Prêmios, faixa do draft
60-67, classe nova (80/77/79/78 no topo), painel "Promessa quebrada" (o jogador saiu no
mercado), coletiva repetida com texto próprio. Na mesma rodada: o All-Star agora guarda
e mostra o placar (era calculado e jogado fora; empate ia sempre pro Leste), o
progresso da promessa só aparece com a temporada rolando (antes mostraria os minutos do
ano anterior) e mostra "0 min, fora da rotação", e o painel da promessa quebrada diz
"não quer renovar" quando o contrato acabou.
Observações sem correção: trocar o modo claro/escuro volta a tela pro topo; o melhor
time da liga fica perto do teto real (~67 vitórias) desde o item 12, e a carreira de
teste (folha de $249M montada com trocas) fez 74-8.

### 3D — upgrade de realismo — FEITO (2026-10-12, `f4f9b91`, `f1be5b2`, `38d1857`)

Fora da lista: veio da análise do protótipo do Gemini (`upgraded_3d_court_engine.tsx`),
refeita com alternativas em RN/Expo para o que parecia impossível. Pedido do usuário:
- **Corpo pela altura e peso reais**: `heightCm`/`weightKg` dos elencos do BBRef
  (`pipeline/sync_physical.py` no simulator; 530/530 na liga atual, eras por posição).
  Altura escala o boneco (0,85-1,16), o IMC engrossa tronco, braços e pernas.
- **Cor de pele pela foto** (`skinTone`): mediana da faixa média de luminância do rosto
  no headshot da NBA; 529/530 na liga atual, 44% nas eras (onde há foto).
- **Uniformes ricos com Skia** (`@shopify/react-native-skia` 2.6.2, `painter.ts`;
  canvas do navegador no web): número com contorno e sobrenome na fonte do app,
  gola V, viés, costura e trama do tecido.
- **Banners de título no teto** (`TEAM_TITLE_YEARS` + títulos da carreira,
  `bannerYears`).
- **Torcida com a cor da casa**: 55% primária, 20% secundária, 10% visitante.
- **Som ao vivo sintetizado** (`react-native-audio-api` 0.13.6, Web Audio no web):
  quique, tênis, apito, aro, cesta, enterrada, buzina e torcida que cresce com as
  cestas do time da casa. Não pede foco de áudio (toca junto com a música).
Conferido no Galaxy (APK `0fb1d782`): uniformes e banners renderizam, quadro 7-10 ms,
~380 MB, som confirmado pelo usuário, log limpo. No mesmo teste: o **botão voltar do
Android fechava o app de qualquer tela** (inclusive no meio do jogo); agora volta para
a tela anterior/Simulação e não faz nada dentro do jogo.

### 3D — quadra do time, torcida, locutor, jogadas — FEITO (2026-10-12, `753906e`, `7b72398`)

Pedido do usuário (itens 1, 2, 4 e 5 da lista "o que dá pra melhorar no 3D" + lapidar
movimentação, física e jogadas):
- **Quadra do time**: apelido no meio da quadra e nas linhas de fundo, cidade na lateral
  do lado oposto às câmeras (decalques Skia, `CourtDecals`), faixa na segunda cor em volta.
- **Torcida que reage**: de pé, pulando e de braços erguidos depois das cestas do seu time
  (shader de vértice sobre o `InstancedMesh`, `cheer`/`CrowdHype` em `Arena.tsx`).
- **Locutor** pt-BR pelo TTS do aparelho (`expo-speech`, `sound/announcer.ts`): bola ao
  alto, três, enterrada, virada no 4º Q, tempo, fim de quarto/jogo; botão "Locutor".
- **Acessórios por jogador** (fixos pelo id): faixa, manga curta/longa, munhequeira,
  manga de perna ou joelheira, meia preta/branca, tênis próprio.
- **Jogadas** roteirizadas por etapa (`playSteps` no `watchDirector`): corta-luz com
  defensor preso, curl do pin-down, entrada no poste e back-down, isolação com lado
  limpo; defesa de ajuda e closeout; lance livre alinhado no garrafão; erro bate no aro e
  vira rebote disputado. Trajetórias em curva (Hermite) sem parar a cada etapa.
- **Física**: bola voa no tempo real (três ~1 s), cai pela rede e quica, fica na mão de quem
  dribla; som do quique e chiado de tênis saem do 3D. Corpos giram, correm de frente,
  defensores deslizam e andam de costas.
- Quarto passou de ~172 para ~194 s reais em 1x (`check_watch_director` todo verde).
Conferido no Galaxy (APK `574cc94a`): decalques, bola na mão, torcida, quadro 8-10 ms,
~400 MB, log limpo; locutor, quique/chiado e movimento confirmados pelo usuário.
Depois do APK: o som da arena pausa quando o app sai da frente (`7b72398`, sem APK ainda).

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

### 4. Redesign do celular — RISCADO (2026-10-12)

O item veio de uma anotação de 5/10 ("usuário insatisfeito com a UI, vai levar ao
Claude Design") que já tinha sido resolvida: o celular recebeu o redesign
"Transmissão" do handoff em 5-6/10 (commits `1705823`..`7171561`) e o PC o seu
layout em 8/10 (`9608dd2`). Não havia handoff novo pendente. Riscado pelo usuário.
Se o visual voltar a incomodar, entra como item novo e concreto.

### 5. Histórico da liga e da franquia (N) — FEITO junto com o 10 (2026-10-12)

Tela nova **Legado** (menu Mais / barra lateral), com quatro abas: Conquistas,
Temporadas, Recordes e Hall da Fama. A base é `SeasonState.seasonHistory`: um
`SeasonRecord` por temporada, gravado quando o campeão é coroado (campanha, seed,
até onde o usuário foi, folha, mandato, campeão e vice, melhor campanha da liga e os
líderes de PTS/REB/AST com 50+ jogos). Saves antigos começam a contar da próxima
temporada. Também novos: `draftInfo.teamId` (quem draftou) e `retiredFrom` (de qual
time ele se aposentou). Tudo em `services/historyService.ts`, derivado, nada pelo feed.
- **Recordes:** da franquia com o usuário, de uma temporada (liga) e de carreira
  (top 5 de PTS/REB/AST entre os jogadores da liga, com as carreiras reais semeadas).
- **Hall da Fama:** derivado na hora; entra o aposentado com pontuação ≥ 25 (MVP 10,
  MVP das Finais 6, DPOY 4, All-NBA 3, All-Star 1,5, título 2, prêmios menores 1,
  1 a cada 2.000 pontos). Em 10 temporadas simuladas entram ~20 (LeBron 191, Curry 99);
  Lowry (22) e Horford (20) ficam de fora.
- **Camisas aposentadas:** decisão do usuário. Candidato = quem se aposentou com a
  camisa do time dele.
- `scripts/check_history.ts [time] [temporadas] [save.json]` roda uma carreira com
  playoffs de verdade e confere o histórico; com o terceiro argumento grava um save
  pronto para o preview web.

### 6. Eras no modelo novo (L) — FEITO (2026-10-12)

As 41 eras agora têm ovr/off/def/usage/ts do Basketball-Reference, pelo mesmo
`apply_bbref.py --ratings --teams` da liga atual (BPM regredido por minutos, com a
temporada anterior pela metade; OVR mapeado na distribuição da própria era).
- `fetch_bbref.py --ratings-only` baixa só as páginas advanced (temporada e anterior)
  e `--standings-only` a classificação; `bbref_join` pula as páginas de dinheiro que
  uma era não tem.
- Nomes: `norm_name` não tira mais "JR" do começo (JR Smith), traduz letras que o NFKD
  não decompõe (Aşık, Guðmundsson), e há aliases para os apelidos da nba_api antiga
  (World B. Free, Tiny Archibald, Fat Lever, Flip Murray...). Um fallback casa
  sobrenome + 3 letras do primeiro nome quando é único. A liga atual sai idêntica.
- Salários continuam sintéticos na escala do teto atual (`compute_salary`), só que
  recalculados pelo OVR novo (12.911 jogadores).
- `pipeline/export_era_records.py` grava `scripts/fixtures/era_records.json` (vitórias
  reais por time), e o `check_eras` mede a correlação. **Vitórias simuladas x reais:
  r médio 0,54 → 0,86** (pior era 0,35 → 0,73), e as 41 melhoraram. Forma da liga
  dentro do real (dp 12,3, melhor 62, pior 17).

### 7. Desenvolvimento ativo (N) — FEITO (2026-10-12)

No cartão do jogador (Meu Time), seção **Treino**:
- **Foco** (Equilibrado / Arremesso / Defesa / Físico), `Player.trainingFocus`, lido
  por `runPlayerProgression` só enquanto ele está no time do usuário. Arremesso e
  Defesa concentram o mesmo ganho num lado (jovem: off +3,9 / def +0,9 contra +2,3 /
  +2,3), e esse é o off/def que o motor transforma em pontos. Físico: jovem evolui um
  pouco menos (×0,88); depois dos 28 tira 1 ponto de metade das quedas, mas zera o
  +1 do platô (veterano −1,74 → −1,31 por ano).
- **Promessa de minutos** (`services/developmentService.ts`): uma por temporada,
  para jogador de até 23 anos, até o jogo 15 ou durante draft/mercado. Cobrada no
  `startOffseason`: 24+ mpg cumpre (desenvolvimento ×1,25 e moral +12), menos que isso
  quebra (moral cai para no máximo 30, perto do pedido de troca em 25).
- **Técnico de desenvolvimento:** `developmentMultiplier` de /100 para /60 (0,65–1,4).
  Em 3 anos, técnico 95 = +0,7 OVR sobre o neutro, técnico 58 = −1,6 (era +0,45/−0,8).
- **Erosão do topo resolvida** (veio do item 12): veterano 34+ cai mais rápido (−1 a
  −4, chance 0,7+), a faixa 24-27 cresce mais (0,55 + potencial, +2 mais frequente) e
  o jovem um pouco mais. Em 12 anos o top-100 fica estável (86,4 → 86,1 e 86,5 → 86,4;
  antes 86,4 → 85,2).
- `scripts/check_development.ts` confere tudo isso.

### 8. 3D — Etapas 1 a 8 restantes (L)

Ver [PLANO-3D.md](PLANO-3D.md). Confirmar com o usuário ao fim de cada etapa.

### 9. Jogo decisivo no 3D (L) — FEITO (2026-10-12)

O Jogo 7 do usuário agora é jogado na quadra 3D ("Jogar o jogo 7 · Na quadra 3D" na
tela de Playoffs). O intervalo do 3D ganha, só nesse jogo, a **tática do quarto**
(Nenhuma / Fechar a defesa / Acelerar o ritmo / Bola na estrela), escolhida de novo a
cada quarto e somada à jogada e ao tempo pedido em `planQuarter`. A tela por quartos
(`LiveGameScreen`, `advanceLiveQuarter`, `startLiveGame`, `LiveGameState`,
`SeasonState.liveGame`) foi apagada; o estado do jogo pendente é só o
`playoff.pendingDecider`, então fechar o app no meio só faz o jogo recomeçar.
As táticas viraram perfil de risco: na tela antiga "isolar" dava +4 sem custo e era
sempre a resposta. Agora (margem por quarto, `check_watch_director`): nenhuma
+3,6 ±7,0, defesa +5,6 ±5,0 (segurar vantagem), ritmo +4,3 ±8,9, estrela +5,6 ±9,9
(correr atrás). Testado no navegador: Jogo 7 das Finais até a coroação do campeão.

### 10. Objetivos e conquistas de GM (N) — FEITO (2026-10-12)

12 conquistas derivadas do `seasonHistory`/`awardHistory`, com progresso quando dá:
Primeiro anel, Bicampeão, Dinastia (3 em 5), Reconstrução (≤30 vitórias → final de
conferência em até 3 temporadas), Título econômico (folha ≤ teto), Cria da casa (MVP
draftado por você), Olho bom (ROY draftado por você), 60 vitórias, Melhor campanha,
Zebra (Finais saindo do 5º ou pior), Presença garantida (5 playoffs seguidos),
Longevidade (10 temporadas). Na aba Conquistas da tela Legado.

### 11. Staff além do técnico (N)

Plano em [PLANO-STAFF.md](PLANO-STAFF.md) (2026-10-13): quatro cargos (preparador físico,
olheiro-chefe, analista de desempenho, assistente de vestiário), orçamento rígido, efeito
medido contra o profissional médio para não descalibrar a liga.

Assistentes, preparador físico (risco de lesão e carga) e olheiros (precisão do
relatório do draft). É grande porque cada um mexe num sistema já calibrado:
re-medir `check_coaches` e `diagnose_season`.

### 12. Ajustes técnicos menores (L) — FEITO em parte (2026-10-12)

- **Pontuação achatada — FEITO.** A NBA real de 2025-26 teve 46 jogadores com
  20+ PPG; a sim dava ~30. A fórmula (usage × TS × minutos) bate com a realidade
  (expoente 1,01 nos dois), então eram duas entradas erradas:
  - os titulares recebiam a curva de minutos na ordem da quadra (PG..C), e todo
    pivô ficava com 28 min (Jokić 28,2, real 34,8). `getRotationWeights` agora
    ordena os titulares por qualidade;
  - o `apply_bbref.py` puxava o usage dos astros para 17% (`K_RATE` 300 → 100;
    Dončić 38,1 → 35,2 antes).
  Os pivôs jogando mais levaram o líder de rebotes a 16; o expoente de rebote caiu
  de 1,0 para 0,8. Resultado: 20+ PPG 41,8, todos os 23 itens do `diagnose_season`
  na faixa, backtest vitórias r 0,855 e força x reais 0,887, PPG por jogador 0,895.
- **Erosão do topo — FEITO no item 7** (top-100 estável em 12 anos).
- `diagnose_season.ts` não responde às decisões (só simula). Sem mudança.
- `check_personality` ("elenco com líder termina com moral mais alta") e
  `check_decisions` são instáveis: falham ~1 vez em 2 com ou sem mudança.

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
- ~~Pendente: as eras ainda usam o modelo antigo de rating~~ — feito no item 6
  (2026-10-12). Resta nas eras: altura/peso por posição (não os reais) e pele pela
  foto só em 44% dos jogadores.

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
