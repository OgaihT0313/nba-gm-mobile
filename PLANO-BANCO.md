# Banco e fadiga no "Assistir ao Jogo" — plano

Item 2 do [ROADMAP.md](ROADMAP.md). Iniciado em 2026-10-04 a pedido do usuário.

## Onde está hoje

- `buildFive` monta os cinco titulares e **eles jogam os 48 minutos**. O banco
  não existe na tela.
- O placar de cada quarto vem de `computeExpectedPoints` — a força do time
  inteiro, pela rotação — dividida por quarto, mais o empurrão da jogada
  chamada. Os cinco em quadra só decidem **quem** marca e o que se desenha.
- O resultado volta para a temporada só como placar (`PinnedGameResult`). O box
  score — minutos, e portanto `load` e risco de lesão — é gerado pela rotação
  padrão, como em qualquer outro jogo. O que acontece na tela não cansa ninguém
  na temporada.

## O que muda

### Energia (0-100), por jogador, dentro do jogo

- Começa em `100 − load × 0,3`: quem chega cansado da temporada já entra baixo.
- Gasta em quadra, recupera no banco. O Guerreiro gasta menos
  (`fatigueFactor`, o mesmo número que ele já usa no risco de lesão).
- Intervalo entre quartos recupera todo mundo um pouco; o do meio do jogo, mais.
- Cansaço custa rendimento: abaixo de 60, o jogador rende menos (`ovr` efetivo
  cai), crescendo conforme a energia desce.

### Rotação automática — o técnico roda o banco

Nas trocas de posse, para cada posição: quem está abaixo do limite de saída dá
lugar ao melhor descansado da rotação que joga a posição; o titular descansado
volta no lugar do reserva. Só usa quem está na rotação (`rotationSize` passa a
valer também na tela). É o comportamento padrão dos dois times.

### O placar passa a ler quem está em quadra

O quarto ganha um ajuste pela força média em quadra (já com o cansaço) contra a
força da rotação que o motor usa para o jogo inteiro — com o mesmo
`matchupStrength` do `computeExpectedPoints`, para o jogo assistido continuar
sendo o mesmo jogo. Com a rotação automática o ajuste fica perto de zero (o
`check_watch_director` mede isso); quem foge dela ganha ou paga.

### O GM mexe no quinteto

No tempo técnico e entre quartos o huddle ganha a aba **Quinteto**: os cinco em
quadra com a energia, o banco, e troca por toque. A rotação automática pode ser
desligada — aí ninguém sai sem você mandar, e o cansaço é problema seu. Durante
o jogo, a energia dos seus cinco aparece no placar e avisa quando alguém está
exausto.

### O que acontece na tela passa a contar na temporada

Os minutos jogados na tela vão para o box score daquele jogo
(`PinnedGameResult.minutes`) — logo para `load` e risco de lesão. Segurar o
titular 46 minutos para ganhar hoje tem preço amanhã.

## Resultado — FEITO (2026-10-04)

As três fases entraram juntas. `check_watch_director`, 300 jogos completos com a
rotação carregada de quarto em quarto como a tela faz:

| | antes | agora |
|---|---|---|
| pontos por jogo | 116,8 | 117-118 |
| minutos dos titulares | 48 | 31,5-39 |
| minutos do banco (5 reservas) | 0 | 9,9-21,7 |
| 4º quarto, rotação automática × titulares o jogo todo | — | ~31,3 × ~28,5 |
| carga dos titulares após um jogo, automática × sem trocas | — | 10,6 × 19,5 |

Calibrado: gasta 0,10/s em quadra, recupera 0,15/s no banco, sai abaixo de 52,
volta a 90; cansaço custa 0,2 de OVR por ponto abaixo de 60.

Três coisas que só apareceram assistindo, e viraram verificação:

- **A rotação automática desfazia a troca do GM** na posse seguinte: o titular
  descansado "voltava" no lugar do reserva escolhido. A escolha do GM agora vira
  a ordem de prioridade do técnico (`userPriority`) — atrás dela, a rotação de
  Meu Time, então o fundo do banco continua fora.
- **Os cinco titulares saíam juntos**, todos ao mesmo tempo, com armadores
  jogando de pivô. No máximo 2 trocas por lado a cada bola parada, o mais
  cansado primeiro; fora de posição só se o jogador estiver abaixo de 35.
- O `check_decisions` também passou a limitar as propostas que as decisões
  "comprar"/"negociar" criam (a caixa chegava a 4), e o portão de "burocracia"
  mede o percentil 95 em vez do pior caso de uma amostra.

## Fases

1. **Motor** (`watchDirector`): energia, rotação automática, quinteto por posse,
   ajuste de placar. Portão no `check_watch_director`: placar médio e desvio
   iguais aos de antes; titulares com ~30-36 minutos e o banco jogando; nenhuma
   posição vazia, ninguém em dois lugares; segurar os titulares o jogo todo
   rende menos no 4º quarto.
2. **Tela**: aba Quinteto no huddle, energia ao vivo, aviso de exausto.
3. **Temporada**: minutos da tela no box score e na carga. Portão: o
   `diagnose_season` continua em 0 de 23.
