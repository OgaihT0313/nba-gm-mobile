# Plano de Ação — Melhoria do módulo 3D (NBA Manager)

## Contexto real do projeto

- **App:** `nba-gm-mobile` (Expo SDK 57 / React Native 0.86), branch `redesign-console-mygm`. Uso pessoal, roda num APK Android.
- **Módulo 3D:** `components/court3d/` (cerca de 1.270 linhas), desenhado pela tela `screens/WatchGameScreen.tsx` ("Assistir ao jogo").
- **Stack 3D:** `three` + `@react-three/fiber/native` + `expo-gl`. A rotação por toque usa o `PanResponder` do React Native.
- **Texturas:** não existe `canvas` no React Native. Toda textura é gerada pixel a pixel (`THREE.DataTexture`) em `textures.ts`, e os textos usam uma fonte de pixels 5x7 própria (`GLYPHS`).
- **Orçamento de desempenho:** Android intermediário. Hoje não há mapas de sombra em tempo real nem pós-processamento; a profundidade vem de sombras de contato e da luz, e tudo que se repete é instanciado.

### O que já existe

| Arquivo | O que faz |
|---|---|
| `Court3D.tsx` | Canvas, câmera com 5 modos (`iso`/Livre, `tv`, `overhead`/Aérea, `close`/Perto, `behind_basket`/Cesta), rotação por toque com retorno suave, 5 luzes simples (hemisférica, ambiente, 3 direcionais), bola com sombra de contato |
| `textures.ts` | Piso de tábuas com a quadra pintada (linhas, garrafão e apron nas cores da casa, sigla no centro, "NBA MANAGER" atrás das linhas de fundo), bola com gomos, rede, sombra suave, camisa com número, placas de LED |
| `Arena.tsx` | Arquibancada completa com torcida instanciada nas cores do time, placas de LED, mesa de anotação e bancos, placar central **estático**, luzes do teto, 2 cestas (tabela de vidro, aro, rede, relógio de posse) |
| `PlayerRig.ts` | Jogador articulado (quadril, joelhos, ombros, cotovelos): corre, agacha para defender, dribla com a direita, sobe os braços no arremesso, com transição suave entre poses |

### O que o 3D recebe hoje

O componente só desenha; quem decide o lance é o `services/watchDirector.ts`. Pela `courtRef` chega o `CourtState`:
- `players[10]`: `x`, `z`, `rotY`, `hasBall`, lado e posição;
- `ball`: `x`, `y`, `z`, `inFlight`;
- `possession`, `handlerName` e `play` (o tipo de jogada).

As props são `home`, `away` (cores), `visual` (tom da madeira por era), `cameraView`, `homeLabel` e `numbers`.

**Não chegam ao 3D:** placar, relógio de jogo, relógio de posse, tipo de finalização (enterrada, bandeja ou arremesso), passes e pontuação de cada lance. A tela tem parte disso (`generateScoringPlays` produz quem pontuou e quantos pontos).

---

### O que o teste no celular mostrou (2026-10-07)

Medido no Galaxy A57 do usuário (tela de 120 Hz, 1080×2340) via adb, com prints em sequência e uma sonda nos valores da câmera:

1. **O ritmo é o problema principal, não o visual.**
   - Um quarto de 12 minutos passa em cerca de 2 minutos de tela, e as posses trocam a cada ~1,5 s.
   - Na troca, os 10 jogadores atravessam 50+ pés em menos de meio segundo, praticamente teletransportados.
   - Nenhuma animação ou câmera fica boa assim: quem assiste não acompanha o lance, e a câmera filma a quadra vazia nesse instante (1 de cada 4 a 6 quadros, mesmo com corte de câmera).
2. **O celular em pé enxerga uma faixa estreita.**
   - Com lente de 38°, a câmera de TV via só ±15 pés de largura. Hoje a lente abre até 60° (±24 pés), e os jogadores ficam pequenos.
   - O HUD ocupa cerca de 35% da altura: placar e câmeras em cima, "Em quadra" e botões embaixo. A quadra útil é uma faixa no meio.
3. **Desempenho tem folga.** Na interface, 95% dos quadros ficaram abaixo de 15 ms, com 6% de quadros atrasados. Há espaço para iluminação e animação, desde que se meça a cada etapa.
4. **Textura no celular é diferente do navegador.** O `expo-gl` ignora o `pixelStorei` e o desenho sobe invertido. O piso já tem o `flipRows`; toda textura nova com texto ou assimetria precisa ser conferida no aparelho.
5. **Avisos no log:** "Multiple instances of Three.js being imported" (o three é carregado duas vezes) e `THREE.Clock` obsoleto. Limpar na Etapa 0.
6. **Uniformes:** o branco do visitante quando as cores colidem já existe e funciona; a Etapa 4 parte dele.
7. **Instrumento de teste:** o adb permite instalar, abrir o jogo, tirar prints em sequência, ler o log e medir quadros sem o usuário. Toda etapa termina com essa checagem no aparelho.

## Regras do escopo

1. **Mexer no 3D:** `components/court3d/`. Quando uma etapa precisar de dados novos, a mudança é **aditiva**:
   - novos campos opcionais no `CourtState` (`watchDirector.ts`);
   - novas props opcionais no `Court3D`, passadas pela `WatchGameScreen`.
   
   Nada que já existe muda de forma ou de significado.
2. **Fora do 3D, nada muda:** design das outras telas, regras do jogo, motor de simulação.
3. **Câmeras:** os 5 modos atuais e o seletor do HUD continuam como estão. Melhorias são internas, sem remover nenhum modo.
4. **Etapas pequenas, em branch própria** (`melhoria-3d`), com um commit por etapa.
5. **Verificação ao fim de cada etapa:**
   - checagem de tipos: `npx tsc --noEmit -p .`;
   - teste do diretor do 3D: `scripts/check_watch_director.ts`;
   - checagem visual no navegador, na tela de "Assistir ao jogo".
6. **Desempenho medido no celular:** um APK de teste a cada duas etapas, porque o navegador não mostra o FPS de um Android.
7. **Orçamento fixo:**
   - nenhum mapa de sombra ligado por padrão;
   - textura nova só gerada uma vez ou quando o dado muda;
   - `devicePixelRatio` com teto de 2;
   - `dispose` de tudo ao sair da tela.
8. **Cores:** dos uniformes, piso e torcida continuam vindo dos times, nunca fixas no código.

---

## Etapa 0 — Reconhecimento e base (sem mudar visual)

- Criar a branch `melhoria-3d`.
- Medir o ponto de partida: contagem de draw calls e de triângulos (`gl.info`) e um APK de referência para comparar o FPS depois.
- Conferir se o `dispose` de geometrias, materiais e texturas acontece ao sair da tela, e aplicar o teto de `devicePixelRatio` se ainda não existir.
- Remover a segunda cópia do three (aviso "Multiple instances") e trocar o `THREE.Clock`.
- Deixar pronto o roteiro de teste no aparelho via adb (instalar, abrir "Assistir ao jogo", prints em sequência por câmera, `dumpsys gfxinfo`).
- Entregar um resumo curto com os números de base.

**FEITO (2026-10-10), menos o APK de referência** (o usuário adiou o build):
- **Base no navegador** (sonda `globalThis.__court3d`, só em modo dev, em `Court3D.tsx`):
  288 draw calls, ~242 mil triângulos, 67 geometrias, 17 texturas. Quadro em 5,5 ms
  (mediana) / 9,0 ms (p95) num PC — não vale para o celular, só para comparar etapas.
  A sonda só mede com o painel do navegador visível (aba oculta pausa o
  `requestAnimationFrame` e o canvas nem monta).
- **Three duplicado: resolvido** no `metro.config.js`. O bundle Android tinha
  `three.cjs` (pelo `require` do fiber) e `three.module.js` + `three.core.js` (pelo
  nosso `import`); agora só `three.cjs`. Bundle dev Android: 27,6 MB → 25,0 MB. O web
  já tinha uma cópia só.
- **`THREE.Clock` obsoleto:** vem de dentro do `@react-three/fiber` 9.7 (o `clock` do
  `useFrame`), não do nosso código. Some quando o fiber atualizar; não vale um patch.
- **Teto de `devicePixelRatio`: não é possível** neste stack. O fiber nativo fixa
  `dpr: PixelRatio.get()` ("expo-gl can only render at native dpr/resolution").
  Reduzir resolução, se precisar na Etapa 8, teria que ser pelo tamanho da GLView.
- **`dispose`:** ao desmontar, o fiber chama `forceContextLoss` e `dispose` na cena;
  com o contexto GL destruído, a memória de GPU vai junto. Nada a acrescentar.
- **Roteiro no aparelho:** `scripts/device_3d.sh` (install / start / measure: prints em
  sequência, `gfxinfo` e avisos do three no logcat), saída em `.device-3d/`.
- **Medida do ritmo** (`check_watch_director`): velocidade máxima de 2,4-2,8 pés por
  0,1 s de jogo (~26 pés/s, realista). O teletransporte é a compressão de tela (~6×),
  não o diretor — é o alvo da 4b.

## Etapa 1 — Piso e marcações oficiais (`textures.ts`, `Court3D.tsx`)

- Tábuas com variação de tom, veios e emendas desencontradas (hoje são só faixas).
- Reflexo de verniz **sem custo de luz extra:** áreas mais claras desenhadas na textura sob os holofotes e `roughness` mais baixo. Testar um `envMap` pequeno e fixo; nada de `MeshPhysicalMaterial` com `clearcoat`, caro demais no celular.
- Conferir e completar as marcações nas medidas reais (94 x 50 ft):
  - linha de 3 pontos com cantos retos a 22 ft e arco de 23,75 ft;
  - círculo de lance livre de 6 ft, com metade de cima sólida e de baixo tracejada;
  - arco da área restrita de 4 ft;
  - marcas de bloco no garrafão e linha do box técnico.
- Emblema da casa no círculo central. Não há imagem do escudo dentro do 3D: desenhar uma marca com a sigla e as cores do time na fonte de pixels.
- **Resolução:** a quadra é uma única textura; aumentar a resolução só se não estourar a memória (medir no APK da Etapa 2).

**FEITO (2026-10-10), falta ver no aparelho.** Tudo em `textures.ts` (`buildFloorTexture`) e
no material do piso:
- Madeira: emenda de topo entre tábuas (~1 px), desencontro por tira, veio com fase
  por tábua, estrias em 1/4 das tábuas e tábuas levemente mais quentes ou frias.
- Verniz pintado: o piso todo (madeira, tinta e linhas) clareia sobre a quadra e em
  5 "poças" de luz, e escurece no apron. `roughness` 0,34 → 0,27. `envMap` não
  testado — fica para a Etapa 2, junto da luz.
- Marcações: canto do 3 pontos exato (14,20 pés, onde a reta encontra o arco de
  23,75); área restrita com os trechos retos até a tabela; low block sólido (7-8
  pés, 8 pol.) e marcas a 11 e 14 pés. Lance livre (6 pés, metade tracejada) e box
  técnico (28 pés) já estavam certos.
- Emblema: anel na cor secundária dentro do círculo central, com a sigla.
- **Custo:** o piso sai em ~170-200 ms no Node (era ~195): as poças são tabeladas por
  linha e coluna (gaussiana separável), os valores da tábua calculados uma vez por
  tábua, e `Math.hypot` trocado por `Math.sqrt`. Cena igual à base (282 draw calls,
  ~243 mil triângulos, 17 texturas).
- **Bug antigo corrigido:** no navegador a sigla saía de cabeça para baixo ("BOS"
  lia "BO2") desde que o celular passou a inverter as linhas (`0534f31`). Agora o
  piso inverte em todas as plataformas; o celular não muda.
- O tempo de quadro no navegador varia com o foco do painel (13-24 ms antes e
  depois desta etapa, na mesma condição); não serve para comparar etapas.

## Etapa 2 — Iluminação de arena simulada (`Court3D.tsx`, `Arena.tsx`)

- Quadra clara e torcida na penumbra, escurecendo a cor das camadas da arquibancada (já são instanciadas).
- **Fachos de holofote "pintados":** planos transparentes em `AdditiveBlending` caindo do teto, mais um halo mais claro no piso. Parece iluminação de teatro sem sombra em tempo real.
- **Contorno nos jogadores (rim light):** uma luz direcional fria por trás, ajustando as 5 luzes atuais em vez de acrescentar novas.
- **Flashes na torcida:** um punhado de pontos que piscam, reaproveitando a malha instanciada (cor por instância). Sem luzes reais.
- **Opcional, desligado por padrão:** uma única luz com sombra (mapa de 1024), atrás de uma opção de qualidade.
- **APK de teste #1** (Etapas 1 e 2): comparar o FPS com a referência da Etapa 0.

**FEITO (2026-10-10), falta o APK #1.**
- **Penumbra:** cor por instância das fileiras e da torcida escurece até 55% da
  primeira para a última fileira (`dusk` no `Bowl`). Nenhuma luz nova.
- **Fachos pintados:** `SpotBeams` em `Arena.tsx` — 5 cones abertos, uma geometria só
  (1 draw call), `ShaderMaterial` aditivo que apaga as bordas da silhueta, o pé do
  facho e os fachos perto da câmera. Caem sobre `LIGHT_POOLS`, as mesmas poças pintadas
  no piso (exportadas de `textures.ts`). Intensidade 0,12: aparecem nos planos abertos
  (Livre); na TV ficam quase todos fora do quadro. **Primeiro corte se faltar FPS.**
- **Contraluz:** a luz fria de preenchimento (-45, 100, -35) virou contraluz baixa
  (-20, 38, -110), do lado oposto às câmeras; ambiente 0,22 → 0,16. Continuam 5 luzes.
- **Flashes:** `Flashes` — 36 pontos fixos na torcida, um `InstancedMesh` aditivo;
  ~2 disparos por segundo, cada um ~0,09 s; só as instâncias que mudam são reescritas.
- **Piso agora `MeshLambertMaterial` (sem especular).** Com a contraluz baixa, o piso
  brilhante refletia a luz direto nas câmeras do lado de cá e lavava a quadra de cinza
  (isolado ligando/desligando luz por luz pela sonda). O verniz fica só o pintado na
  textura (Etapa 1); `roughness` 0,27 da Etapa 1 também dava um clarão na TV. Por isso
  o `envMap` não foi testado: sem especular no piso, não tem efeito.
- **Sombra opcional:** não feita — não existe opção de qualidade na tela; fica para a
  Etapa 8 se o FPS sobrar.
- Sonda dev ganhou `scene` (`__court3d.scene`) para ligar/desligar luz e malha pelo
  console. Página recém-carregada: 17 texturas (igual à base), 69-72 geometrias (+2).

## Etapa 3 — Tabela, aro e rede (`Arena.tsx`)

- Tabela com o quadrado-alvo branco (24 x 18 pol.) e borda de LED vermelha que acende no estouro do relógio de posse. Depende do dado da Etapa 5; até lá fica apagada.
- Aro com suporte e mola visíveis, e acolchoamento na base da estrutura.
- Rede afunilada com ondulação quando a bola passa. A animação é disparada no 3D: a bola atravessando a altura do aro perto dele. Não precisa de dado novo.
- **Leve reação do aro em enterrada:** fica para a Etapa 4, que é quando o 3D passa a saber que o lance foi uma enterrada.

**FEITO (2026-10-10).** Tudo em `Arena.tsx` (`Hoop`):
- Borda de LED vermelha em volta do vidro (`shotClockEdge`), acesa de leve (0,12) até
  a Etapa 5 ligar ao relógio de posse. Uma malha só (`mergeParts`, helper novo que os
  fachos também usam).
- Aro com placa no vidro, braço e caixa da mola — uma malha. Aro, suporte e rede
  penduram num pivô no vidro: a Etapa 4 dá o puxão da enterrada, aqui ele já volta
  com um quique amortecido.
- Acolchoamento grosso na face da base virada para a quadra.
- Rede mais afunilada (5 pontos, com a ponta solta) que estica, afina e balança por
  0,75 s quando a bola cruza a altura do aro dentro dele — detectado no 3D lendo a
  bola do `courtRef` (que agora também chega ao `Arena`).
- Custo: +3 malhas por cesta (borda, suporte, acolchoamento).

## Etapa 4 — Jogadores: modelo e animações (`PlayerRig.ts`, `watchDirector.ts`)

**A etapa de maior impacto e de maior trabalho.**

**Modelo:**
- regata com friso nas cores do time;
- bermuda com cós;
- meias e tênis com solado contrastante;
- faixa e manguito em alguns jogadores, de forma fixa por jogador (pelo id), não sorteada a cada jogo.

**Dados (aditivos no `watchDirector`):**
- `PlayerState` ganha opcionalmente `action` (`'dribble' | 'pass' | 'shot' | 'layup' | 'dunk' | 'contest' | 'idle'`) e `actionT` (de 0 a 1, quanto da ação já passou).
- O diretor já sabe quem finaliza e de onde, e tem os atributos do jogador para decidir se é enterrada, bandeja ou arremesso.

**Animações** (procedurais, como hoje, sem arquivos de animação):
- drible com o braço livre protegendo a bola;
- arremesso com salto, punho quebrando e mão de apoio;
- bandeja;
- enterrada com o aro balançando;
- passe;
- defesa com base aberta, um braço contestando e o outro baixo.

**Cabeça acompanhando a bola:** o pescoço gira em direção à bola, limitado a ±70°.

**Teste:** o `check_watch_director` ganha checagens para os campos novos, por exemplo que toda cesta tenha uma ação de finalização antes.

**APK de teste #2** (Etapas 3 e 4).

**FEITO (2026-10-10), falta o APK #2.**
- **Dados (aditivos):** `PlayerState.action`/`actionT` e `Possession.finish`
  (`'shot' | 'layup' | 'dunk'`). Dois perto do aro (< 8 pés) são bandeja; uma bandeja
  convertida vira enterrada com a chance de `dunkChance` (atletismo + ser pivô/ala-
  pivô; 5%-75%), e a enterrada sobe o ponto de soltura da bola até o aro. A ação sai
  da batida em curso: o arremesso cobre a preparação e o voo (soltura em 0,4), o
  marcador do arremessador contesta na mesma janela, o passe é a batida em que a bola
  vai do armador ao arremessador, e quem tem a bola dribla.
- **Modelo:** friso lateral na regata; cós da bermuda e solado contrastante do tênis
  pintados como faixas (`buildBandTexture`, 1x32 px, compartilhadas por time — 0 malha
  nova, +4 texturas); faixa de cabeça (22%) e manguito (20%) fixos pelo id do jogador.
- **Animações** (`PlayerRig.ts`, procedurais, misturadas com a pose de corrida):
  arremesso (agacha, sobe, cotovelo estica na soltura, mão de apoio sai,
  acompanhamento), bandeja (impulso de um pé, joelho esquerdo sobe, braço direito
  alto), enterrada (2,8 pés de impulso, pendura com os joelhos dobrados) com o aro
  puxado e voltando (pivô da Etapa 3), passe de peito, contestação com um braço reto,
  drible com o outro braço protegendo. **Cabeça segue a bola** (pescoço próprio,
  limite ±70°).
- **Teste:** `check_watch_director` confere que toda cesta mostra a finalização antes
  de a bola chegar ao aro (1.041/1.041), que toda cesta é contestada e todo passe
  aparece (1.807/1.807). Feitas: 716 arremessos, 201 bandejas, 124 enterradas (38% das
  finalizações perto do aro).
- Cena na TV: 299 draw calls, ~244 mil triângulos, 21 texturas.
- Ainda **não** feito do plano: punho quebrando (a mão é uma esfera, sem pulso) e a
  câmera de ação (é a Etapa 7).

## Etapa 4b — Ritmo da partida (`watchDirector.ts`, `WatchGameScreen.tsx`)

**A causa nº 1 de o 3D parecer estranho no celular** (ver "O que o teste no celular mostrou").

- **Transição com tempo mínimo:** depois de uma cesta ou de uma troca de posse, os jogadores levam um tempo real para atravessar a quadra, com velocidade máxima plausível (piques de ~25 pés/s em escala de tela). Hoje é quase instantâneo.
- **Menos compressão, ou compressão inteligente:** em vez de mostrar todas as posses aceleradas, a velocidade normal mostra as posses inteiras e o diretor "pula" o miolo de algumas (corte para o próximo ataque), como um compacto de TV. O 4X continua para quem quer correr.
- **Pausa curta depois da cesta:** cerca de 1 s com a bola passando pela rede (casa com a rede da Etapa 3) antes da reposição.
- O placar, o relógio e o resultado não mudam: o diretor continua seguindo o mesmo roteiro de pontos, só com outro tempo de tela.
- **Teste:** `check_watch_director` ganha uma checagem de velocidade máxima dos jogadores por quadro, e no aparelho medimos quantos quadros em sequência mostram a quadra vazia (a meta é nenhum).

**FEITO (2026-10-10), falta o teste no aparelho.** `advanceClock` no `watchDirector.ts`
(função pura, nova) decide quanto o relógio anda a cada quadro, e o `CourtState`
ganhou o campo opcional `cut`:
- Cada posse entra na tela já na chegada (30% da posse nas suas, na jogada — 52% —
  nas do adversário); a corrida antes disso vira **corte**, e a câmera (todos os 5
  modos, inclusive o Perto), os jogadores e a bola saltam junto, sem ler o salto
  como pique.
- A taxa é calculada **por batida**: o diretor sabe quanto cada jogador anda entre
  duas batidas e limita a velocidade na tela a `SCREEN_SPRINT` = 34 pés/s; batidas
  paradas passam a até 3,6 s de jogo por segundo.
- Depois da cesta, ~1 s com a bola na rede; depois do erro, ~0,5 s no rebote.
- Saiu a câmera lenta depois de chamar a jogada (existia porque a posse passava em
  menos de 2 s). O 4X continua, multiplicando tudo.
- **Medido** (`check_watch_director`, 40 quartos a 60 quadros/s): pico na tela 34
  pés/s entre cortes (era ~250); 1.838 de 1.838 arremessos na tela; quarto em ~173 s
  reais em 1x (157-199), ~46 cortes por quarto; placar idêntico ao do plano.
  No navegador, 5 prints seguidos na câmera TV mostram os dez em quadra.

## Etapa 5 — Placar e relógio ao vivo (`Arena.tsx`, `Court3D.tsx`, `WatchGameScreen.tsx`)

- Nova prop opcional no `Court3D`: `scoreboard?: { home: number; away: number; quarter: number; clock: number; shotClock?: number }`, passada pela `WatchGameScreen`, que já tem esses números.
- O placar central e os relógios de posse sobre as tabelas passam a mostrar os valores reais. As placas de LED mostram a sigla do time e uma animação simples ao fim de cada cesta.
- A textura só é redesenhada quando um número muda, nunca a cada frame.

**FEITO (2026-10-10), falta ver no aparelho.**
- Prop `scoreboard?: ScoreboardData` no `Court3D` (`home`, `away`, `quarter`, `clock` =
  segundos restantes no período, `shotClock?`, `homeLabel?`, `awayLabel?`). A
  `WatchGameScreen` já atualizava placar e relógio a 5 Hz; o relógio de posse sai da
  posse em curso (24 − tempo desde o início dela), só com o jogo rolando.
- Placar central: as 4 telas mostram siglas sobre a cor de cada time, quarto (Q1-Q4,
  OT, OT2…), os pontos e o relógio (`paintScoreboard`, 256x128). Relógio de posse em
  dígitos vermelhos numa face virada para a quadra em cada tabela (uma textura 64x32
  para as duas). Texturas repintadas por `useEffect` só quando o texto muda.
- Borda de LED da tabela acende quando o relógio de posse zera (com posses de 13-18 s
  na simulação, quase nunca).
- Placas de LED: sigla da casa no letreiro, e a cada cesta brilham e correm por 1,2 s.
- Fonte ganhou `:` e `.`.
- Conferido no navegador desenhando as texturas vivas por cima da tela (a câmera não
  enquadra o placar a 62 pés): NYK 5 × 6 BOS, Q1, 9:59, posse 9 — igual ao HUD.
  Orientação do relógio de posse no aparelho ainda a confirmar de perto.

## Etapa 6 — Bola (`Court3D.tsx`, `textures.ts`)

- Couro com mais textura e canais mais definidos.
- **Giro para trás (backspin)** no arremesso, girando em torno do eixo perpendicular à trajetória enquanto a bola está no ar (`inFlight`).
- A sombra de contato fica nítida e escura com a bola no chão e difusa e clara no alto (a escala pela altura já existe; falta ajustar a opacidade).
- **Arco do arremesso:** o diretor já calcula a trajetória; revisar se a altura do arco está realista para cada distância, sem mudar o tempo do lance.

**FEITO (2026-10-11), falta ver no aparelho.**
- Couro 512x256 (era 256x128): granulado em pontinhos com luz de um lado, gomos com
  sulco de borracha e a borda do couro escurecendo em direção a ele. ~25 ms no Node.
- Giro de verdade: eixo = vertical × direção do movimento. No ar, backspin a ~2
  voltas/s (o topo volta para o arremessador); no chão e no drible, rola para onde
  anda. Antes girava num eixo fixo do mundo, qualquer que fosse a direção.
- Sombra da bola: 0,9 → 2,5 de escala e opacidade 1 → 0,28 conforme sobe.
- Arco do jump: 1 + 0,3 × distância (saída ~50°) em vez de fixo por tipo — antes o
  lance livre subia mais que um arremesso de média. Agora ~8 pés acima da linha
  mão-aro de três, ~5 no lance livre, ~4 de 10 pés. Tempo do lance igual.

## Etapa 7 — Câmeras (`Court3D.tsx`)

- **Os 5 modos continuam.** Ajustes internos:
  - transição suave ao trocar de modo (hoje o movimento é de apenas uma parte do caminho por frame);
  - limite para a câmera não atravessar o piso nem a arquibancada.
- **Câmera de ação:** no modo "Perto", seguir quem está com a bola e cortar para a cesta no arremesso. Usa a `action` da Etapa 4.
- **Celular em pé (já feito em 2026-10-07):**
  - a lente abre até 60°;
  - a câmera segue o centro da jogada com atraso curto;
  - um salto de mais de 30 pés vira corte.
- **Ainda a fazer na tela em pé:**
  - cortar assim que a jogada sair da área visível, sem esperar o salto de 30 pés;
  - mirar no centro da faixa que o HUD deixa livre, e não no centro da tela;
  - avaliar o "Perto" como câmera padrão no celular (mostra pessoas, não formação);
  - avaliar um HUD que se recolhe durante o lance.
- **Avaliar modo paisagem** só na tela do 3D: resolve o campo estreito de uma vez, mas exige liberar a rotação do app nessa tela.

## Etapa 8 — Desempenho e fechamento

- **APK de teste final** com os números comparados à referência da Etapa 0.
- Se faltar desempenho, cortar nesta ordem:
  1. fachos de luz;
  2. resolução do piso;
  3. flashes na torcida;
  4. detalhes do modelo dos jogadores.
- Resumo final:
  - arquivos alterados (`git diff --stat`), com confirmação de que fora de `components/court3d/` só houve os acréscimos previstos em `watchDirector.ts` e `WatchGameScreen.tsx`;
  - o que foi feito em cada etapa.

---

## Critérios de aceite

- [ ] Fora de `components/court3d/`, só acréscimos opcionais no `watchDirector.ts` e na `WatchGameScreen.tsx`
- [ ] Checagem de tipos limpa e `check_watch_director` passando em todas as etapas
- [ ] Os 5 modos de câmera e o HUD atual funcionando como antes
- [ ] Piso com madeira e verniz convincentes e marcações nas medidas oficiais
- [ ] Iluminação de arena (quadra clara, torcida em penumbra) sem sombras em tempo real por padrão
- [ ] Tabela, aro e rede animados; borda de LED ligada ao relógio de posse
- [ ] Jogadores com uniforme completo e animações de drible, arremesso, bandeja, enterrada, passe e defesa, com a cabeça seguindo a bola
- [ ] Placar, relógio de jogo e relógio de posse do 3D mostrando os números reais da partida
- [ ] Bola com giro e sombra de contato que reage à altura
- [ ] FPS no APK final igual ou próximo da referência da Etapa 0

**Ordem:** 0 → 4b → 1 → 2 → (APK #1) → 3 → 4 → (APK #2) → 5 → 6 → 7 → 8. A 4b vem logo depois da 0: sem ritmo jogável, as outras melhorias passam despercebidas. Ao fim de cada etapa: resumo de 2 a 3 linhas, verificação ok e confirmação antes de avançar.
