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

## Etapa 2 — Iluminação de arena simulada (`Court3D.tsx`, `Arena.tsx`)

- Quadra clara e torcida na penumbra, escurecendo a cor das camadas da arquibancada (já são instanciadas).
- **Fachos de holofote "pintados":** planos transparentes em `AdditiveBlending` caindo do teto, mais um halo mais claro no piso. Parece iluminação de teatro sem sombra em tempo real.
- **Contorno nos jogadores (rim light):** uma luz direcional fria por trás, ajustando as 5 luzes atuais em vez de acrescentar novas.
- **Flashes na torcida:** um punhado de pontos que piscam, reaproveitando a malha instanciada (cor por instância). Sem luzes reais.
- **Opcional, desligado por padrão:** uma única luz com sombra (mapa de 1024), atrás de uma opção de qualidade.
- **APK de teste #1** (Etapas 1 e 2): comparar o FPS com a referência da Etapa 0.

## Etapa 3 — Tabela, aro e rede (`Arena.tsx`)

- Tabela com o quadrado-alvo branco (24 x 18 pol.) e borda de LED vermelha que acende no estouro do relógio de posse. Depende do dado da Etapa 5; até lá fica apagada.
- Aro com suporte e mola visíveis, e acolchoamento na base da estrutura.
- Rede afunilada com ondulação quando a bola passa. A animação é disparada no 3D: a bola atravessando a altura do aro perto dele. Não precisa de dado novo.
- **Leve reação do aro em enterrada:** fica para a Etapa 4, que é quando o 3D passa a saber que o lance foi uma enterrada.

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

## Etapa 4b — Ritmo da partida (`watchDirector.ts`, `WatchGameScreen.tsx`)

**A causa nº 1 de o 3D parecer estranho no celular** (ver "O que o teste no celular mostrou").

- **Transição com tempo mínimo:** depois de uma cesta ou de uma troca de posse, os jogadores levam um tempo real para atravessar a quadra, com velocidade máxima plausível (piques de ~25 pés/s em escala de tela). Hoje é quase instantâneo.
- **Menos compressão, ou compressão inteligente:** em vez de mostrar todas as posses aceleradas, a velocidade normal mostra as posses inteiras e o diretor "pula" o miolo de algumas (corte para o próximo ataque), como um compacto de TV. O 4X continua para quem quer correr.
- **Pausa curta depois da cesta:** cerca de 1 s com a bola passando pela rede (casa com a rede da Etapa 3) antes da reposição.
- O placar, o relógio e o resultado não mudam: o diretor continua seguindo o mesmo roteiro de pontos, só com outro tempo de tela.
- **Teste:** `check_watch_director` ganha uma checagem de velocidade máxima dos jogadores por quadro, e no aparelho medimos quantos quadros em sequência mostram a quadra vazia (a meta é nenhum).

## Etapa 5 — Placar e relógio ao vivo (`Arena.tsx`, `Court3D.tsx`, `WatchGameScreen.tsx`)

- Nova prop opcional no `Court3D`: `scoreboard?: { home: number; away: number; quarter: number; clock: number; shotClock?: number }`, passada pela `WatchGameScreen`, que já tem esses números.
- O placar central e os relógios de posse sobre as tabelas passam a mostrar os valores reais. As placas de LED mostram a sigla do time e uma animação simples ao fim de cada cesta.
- A textura só é redesenhada quando um número muda, nunca a cada frame.

## Etapa 6 — Bola (`Court3D.tsx`, `textures.ts`)

- Couro com mais textura e canais mais definidos.
- **Giro para trás (backspin)** no arremesso, girando em torno do eixo perpendicular à trajetória enquanto a bola está no ar (`inFlight`).
- A sombra de contato fica nítida e escura com a bola no chão e difusa e clara no alto (a escala pela altura já existe; falta ajustar a opacidade).
- **Arco do arremesso:** o diretor já calcula a trajetória; revisar se a altura do arco está realista para cada distância, sem mudar o tempo do lance.

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
