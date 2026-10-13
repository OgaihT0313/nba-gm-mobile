# Minha Carreira — plano

Modo novo, pedido pelo usuário em 2026-10-12. Plano aprovado em 2026-10-12.

**Andamento:** fase 1 feita em 2026-10-13 (`14ab9a7`): criação, combine, noite do draft,
temporada com a confiança do técnico (`Team.favor`), treino semanal e pontos de evolução
com teto escondido, abas Hoje/Treino/Time/Carreira, save separado, `scripts/check_career.ts`.
Medido: escolhas de 1 a 30 no draft; a maioria vira reserva e alguns titulares no 3º-4º ano;
um nº 1 virou All-NBA. Uma temporada leva ~0,7-1,2 s no Node.

Você cria um jogador, passa pelo campeonato de testes pré-draft, é escolhido por um time
e vive a carreira dele até a aposentadoria. É praticamente um segundo jogo dentro do app,
então o plano começa pelas decisões que definem se ele é divertido, não pela lista de telas.

## Decisões já tomadas (usuário, 2026-10-12)

1. **Durante o jogo: momentos de decisão.** Não há controle em tempo real; o jogo para
   nos lances em que a bola chega em você e você escolhe o que fazer.
2. **Duas portas de entrada:** *Minha Carreira* (liga atual, 2025-26) e *Minha Carreira
   Eras* (entrar numa das 41 eras, ex. a classe de draft de 1984).
3. **Separado do modo GM.** Outro espaço de save, outra tela inicial, sem virar GM depois.
   O app passa a ter dois saves: o do GM e o da carreira.

## O que torna o modo divertido (e onde costuma falhar)

- **O que você faz no jogo.** Assistir o seu boneco jogar sozinho cansa em três partidas.
  Os momentos de decisão são o centro do modo e precisam ser rápidos (4 a 8 por jogo,
  poucos segundos cada) e ter consequência visível no placar e na sua linha estatística.
- **Espaço conquistado, não dado.** Calouro começa onde a escolha do draft o coloca: um
  nº 1 pode ser titular; um 2º round começa fora da rotação. Minutos vêm da confiança do
  técnico, que sobe e desce com o que você faz.
- **Curva crível.** Virar MVP no segundo ano mata o modo; ficar preso no banco quatro
  anos também. A meta é a distribuição real: medida por script, não por intuição (ver
  "Medição").
- **A liga não para por você.** Você é um jogador entre 450; a simulação da temporada é a
  mesma do GM, com você dentro dela.

## O que já existe e é reaproveitado

| Peça | Onde | Como entra |
|---|---|---|
| Simulação da liga | `seasonRunner.simulateOneDay`, `simulationService` | Igual; seu jogador é mais um no elenco. O seu jogo do dia é "fixado" (`PinnedGameResult`) com o resultado que incluiu os seus momentos |
| Calendário, classificação, playoffs, Copa, All-Star, prêmios | idem | Igual; prêmios e All-Star já escolhem por estatística, então você concorre de verdade |
| Classe de draft | `draftService.generateDraftClass` / `generateRealDraftClass` | Você é inserido como prospecto; nas eras, junto da classe real |
| Projeção de escolha | `projectedPickSlot`, `scoutProspect` | Vira a faixa de projeção antes do draft, que o campeonato de testes mexe |
| Evolução e idade | `simulationService` (progressão), `developmentService` | Mesma curva de idade; o foco de treino passa a ser escolha sua |
| Contratos | `freeAgencyService` (`askingSalary`, `evaluateSigningInterest`) | Do outro lado da mesa: o seu valor sai da mesma fórmula; times fazem ofertas |
| Personalidade, moral, química | `personalityService` | Você escolhe a personalidade na criação; ela pesa como já pesa |
| Coletiva | `pressService` | Perguntas sobre você; respostas mexem com técnico, torcida e vestiário |
| Marcos e manchetes | `milestoneService`, `headlineService` | Seus marcos (1.000 pontos, triplo-duplo) viram manchete |
| Carreira e legado | `careerService`, `retirementService`, `LegacyScreen` | Totais, prêmios, aposentadoria, camisa aposentada |
| 3D | `watchDirector`, `Court3D`, `PlayerRig` | Os momentos são posses roteirizadas com você; altura, peso, pele, acessórios e número vêm da criação |
| Carreiras reais | `sync_careers.py` (totais e prêmios reais) | Comparação com as lendas ("você passou Larry Bird em pontos") |

## O que é novo

### 1. Criação

- Nome, número, nacionalidade (texto), posição (PG/SG/SF/PF/C).
- **Estilo** (define o teto de cada atributo): arremessador, infiltrador, armador,
  "3 and D", protetor de aro, pivô de garrafão, ala versátil. Cada um com 2 forças e 1
  fraqueza.
- **Altura e envergadura** dentro da faixa real da posição; altura troca atributos
  (mais alto → rebote/defesa interior sobem, arremesso e atletismo descem). Peso pela
  altura com ajuste.
- **Visual:** tom de pele, cabelo, acessórios (o `PlayerRig` já recebe tudo isso).
- **Personalidade:** uma das `PERSONALITIES` existentes.
- Começa com 19 anos, OVR ~58-64 (faixa de calouro), potencial escondido como faixa.

### 2. Pré-draft

- **Campeonato de testes (combine):** 3 a 4 testes curtos de decisão (arremesso parado,
  agilidade, entrevista com times). Resultado mexe a projeção em até ±8 posições.
- **Treinos com times:** escolher 2 de 4 times interessados; aumenta a chance de cair num
  deles.
- **Noite do draft:** a ordem real da simulação; os times escolhem pelos relatórios do
  scout (o mesmo critério dos times da CPU). Pode cair no 2º round ou não ser escolhido
  (vai para a liga de desenvolvimento e tenta um contrato de dois sentidos).
- **Eras:** a classe é a real daquele ano, com você inserido. Os times escolhem pela
  mesma regra, então você pode tirar o lugar de alguém de verdade.

### 3. Temporada

- O dia avança como no GM (+1 dia / até o próximo jogo / semana).
- **Jogo do dia:** "Jogar" (com momentos) ou "Simular" (resolve sem você decidir, com o
  desempenho médio do seu nível). Jogar é sempre a opção que rende mais confiança.
- **Papel e minutos:** fora da rotação → reserva → sexto homem → titular → estrela.
  O técnico decide pela **confiança** (0-100), que sobe com bons jogos, momentos bem
  escolhidos e atitude, e cai com erros, má fase e reclamação. Os minutos entram no
  `getRotationWeights` do seu time.
- **Treino da semana:** escolher o foco (um atributo, condicionamento ou descanso).
  Evolução usa a mesma curva de idade do jogo, com bônus pelo foco e pelo uso em jogo.
- **Pontos de evolução:** ganhos por treino e desempenho, gastos nos atributos dentro do
  teto do estilo. Calibrados para não inflar: o top-100 da liga continua estável.
- **Lesões e carga:** as do jogo; jogar machucado é uma decisão (mais minutos, mais risco).

### 4. Momentos de decisão (a peça central)

- Por jogo, 4 a 8 posses em que a bola chega em você (mais quanto maior o seu papel e o
  seu uso). O restante do jogo é simulado.
- **Cada momento:** o 3D congela no instante da decisão, com a câmera no seu jogador e
  uma leitura da situação (relógio, marcador, quem está livre). Três ou quatro opções,
  ex.:
  - com a bola: arremessar de três / infiltrar / passar para o livre / jogar o
    corta-luz / segurar o relógio;
  - sem a bola: cortar para a cesta / abrir para a zona morta / bloquear para o
    companheiro;
  - na defesa (alguns): antecipar o passe / ficar no seu homem / dobrar no pivô.
- **Resultado:** probabilidade a partir dos seus atributos, do defensor (o adversário real
  em quadra) e da qualidade da escolha para aquela leitura. Escolher bem é visível: a boa
  opção tem chance maior, e o jogo mostra por quê ("o marcador passou por baixo do
  corta-luz").
- **Consistência com o placar:** o jogo é resolvido como hoje (pontos esperados do time,
  `computeExpectedPoints`); os momentos ajustam os seus pontos e os do time pela diferença
  entre o esperado e o que aconteceu. Como no "Assistir ao jogo", o placar final é o que
  aconteceu na tela.
- **3D:** o lance roda no `watchDirector` com você como o arremessador ou passador
  daquela posse, com o desfecho escolhido; replay quando for bonito. Marcação no chão sob
  o seu jogador para achá-lo rápido.
- **Peso no equilíbrio:** a escolha certa rende ~+1 a +2 pontos por jogo sobre a escolha
  média; a diferença maior é na confiança do técnico e no seu ritmo de evolução.

### 5. Fora da quadra

- **Relações:** técnico (confiança), companheiros (química, assistências), diretoria
  (seu valor de troca e renovação). Um painel mostra cada uma.
- **Coletiva:** perguntas sobre você (fase, papel, rival, contrato); respostas mexem nas
  relações. Reaproveita `pressService`.
- **Pedido de troca:** se a confiança e o papel ficarem baixos, você pode pedir; a
  diretoria aceita ou não conforme seu valor.
- **Contrato:** escala de calouro pela escolha; extensão no último ano; agência livre com
  ofertas reais dos times (quem tem espaço e precisa da sua posição). Você escolhe
  dinheiro × papel × chance de título.
- **Agente:** recomenda e negocia; mais tarde, patrocínios (fora da primeira versão).

### 6. Legado

- Prêmios e All-Star (já calculados pela simulação), seus marcos, títulos.
- **Hall da Fama:** probabilidade a partir do currículo, mostrada ao longo da carreira.
- **Aposentadoria:** você decide quando (com o corpo avisando: atletismo caindo, lesões).
- **Comparação com as lendas:** posição em pontos, rebotes e assistências entre as
  carreiras reais (`sync_careers.py`).

## Estado e save

- `CareerState` próprio (não `SeasonState` do GM): a liga (times, jogadores, calendário,
  playoffs, histórico) reaproveita os tipos do GM; em volta dela, `me` (id do seu
  jogador), confiança, papel, relações, pontos de evolução, jogos com o seu log, e o
  progresso do pré-draft.
- **Save separado:** `nba-manager-career` (arquivo no celular, localStorage no site), um
  espaço só por enquanto, com o mesmo autosave do GM.
- **App:** a tela inicial ganha a escolha de modo (GM / Minha Carreira / Minha Carreira
  Eras). A carreira roda num componente raiz próprio (`CareerApp`), para não inflar o
  `App.tsx` do GM, e usa os mesmos serviços puros.

## Medição

O mesmo princípio do resto do projeto: o equilíbrio é medido, não suposto.

- `scripts/check_career.ts` roda 300 carreiras completas com dois robôs (escolhas médias e
  escolhas boas) para cada faixa de draft e mede:
  - % que vira titular, All-Star, MVP, campeão; duração média da carreira; OVR máximo;
  - comparar com a NBA real por faixa de escolha (um nº 1 vira All-Star ~40-50% das
    vezes; um fim de 1º round, ~5-10%; um 2º round, raramente).
- A liga com você dentro continua passando o `diagnose_season` e o `check_development`
  (top-100 estável).
- Os momentos: taxa de acerto por opção e por atributo, e a diferença de pontos por jogo
  entre o robô médio e o bom (meta: +1 a +2).

## Fases

Cada fase termina jogável e é conferida no celular antes da próxima.

| Fase | O que entrega | Tamanho |
|---|---|---|
| **1. Base** | Escolha de modo, criação, pré-draft (combine simples + noite do draft), contrato de calouro, temporada com "Simular" por jogo, papel e confiança, treino semanal e evolução, tela da carreira (linha estatística e log), save separado, `check_career` | M (alguns dias) |
| **2. Momentos** | Decisões por jogo no 3D, câmera e marcação no seu jogador, resultado ligado ao placar, replay; "Jogar" vira a opção principal | M |
| **3. Fora da quadra** | Relações, coletiva sobre você, pedido de troca, extensão e agência livre com ofertas, agente | M |
| **4. Legado** | Hall da Fama, aposentadoria, comparação com as lendas, número aposentado | P |
| **5. Eras** | Entrar numa era: classe real com você inserido, liga seguindo a história real enquanto ela não for alterada por você | P a M |
| Depois | Patrocínios, Jogo das Estrelas jogável, torneio de enterradas/três, versão PC (layout desktop) | — |

A versão de PC (site) segue as mesmas fases, com o layout desktop entrando junto da fase 1
ou logo depois, como o GM.

## Perguntas em aberto (respondo ao começar cada fase, salvo objeção)

- **Dificuldade:** uma só, calibrada pela medição. Um ajuste "fácil/normal/difícil" pode
  vir depois, se fizer falta.
- **Quantos momentos:** começo com 4-8 por jogo; se ficar lento, cai para 3-5.
- **Simular a temporada inteira:** permitido, mas sem momentos a confiança cresce mais
  devagar.
- **Classe de draft na liga atual:** a próxima classe gerada pelo jogo (2026), já que a
  de 2025 foi a real.
