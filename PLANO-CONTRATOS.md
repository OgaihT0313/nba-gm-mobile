# Ciclo de contratos — plano

Item 1 do [ROADMAP.md](ROADMAP.md). Iniciado em 2026-10-04 a pedido do usuário.

## Por que — medido, não suposto

O ROADMAP descrevia o teto como "um número que você lê, não uma restrição". A
medição multi-temporada mostrou que é pior que isso: **a economia da liga não se
sustenta**. Antes desta rodada nada media o ciclo de contratos, porque ele só
existe *entre* temporadas e a offseason vivia dentro de um `setState` do
`App.tsx`. Ela virou `services/offseasonService.ts` (puro, sem mudança de
comportamento) e `scripts/check_contracts.ts` roda carreiras inteiras.

Linha de base (2 carreiras × 5 anos, motor de antes desta rodada):

| ano | folha mediana | times > teto | agentes livres sem time (76+) | jogadores 80+ com contrato vencendo: ficam / trocam de time / **sem time** | salário ÷ valor (80+) |
|---|---|---|---|---|---|
| 1 | $179M | 26 | 80 (34) | 22: 0 / 0 / **22** | 0,98 |
| 2 | $151M | 9 | 185 (64) | 35: 0 / 7 / **28** | 0,93 |
| 3 | $143M | 2,5 | 237 (62) | 30: 0,5 / 13 / **16** | 0,88 |
| 5 | $110M | 0 | 312 (75) | 30: 1 / 19 / **9** | 0,75 |

Quatro defeitos, em ordem de gravidade:

1. **Ninguém renova com ninguém.** Contrato vencido = agente livre, sempre. Não
   existe direito de renovação (Bird rights), e como quase todo time está acima
   do teto, ninguém pode assinar o jogador de volta — nem o próprio time.
2. **O pedido salarial nunca muda.** Um jogador de $40M que vira agente livre
   continua pedindo $40M para sempre, então só um time com $40M de espaço o
   contrata. Resultado: 22 jogadores 80+ passam a temporada **inteira sem time**
   no primeiro verão. A liga vaza talento ano a ano.
3. **Salário congelado.** Renovar (`newContractYears`) só reinicia os anos; o
   salário é o do JSON. A estrela que evoluiu continua barata, o veterano que
   caiu continua caro, e nenhum contrato novo reflete o jogador de hoje.
4. **A assinatura "de necessidade" da CPU ignora o teto e leva o melhor
   disponível**, não um mínimo — o único caminho para uma estrela mudar de time
   é um time ficar com menos de 8 jogadores.

Menores: dispensar um jogador apaga o salário dele da folha (sem dinheiro morto);
o usuário não tem custo nenhum por pagar demais.

## Modelo — teto flexível da NBA, com os números reais de 2025-26

Todas as eras usam a mesma escala salarial (o pipeline normaliza contra o teto
atual), então uma tabela só vale para tudo.

| | valor | papel |
|---|---|---|
| Teto (`SALARY_CAP`) | $154,6M | abaixo dele, assina qualquer um que caiba |
| Linha de imposto (`LUXURY_TAX`) | $187,9M | acima dela o dono paga imposto — custo para o usuário |
| Exceção de nível médio (`MID_LEVEL_EXCEPTION`) | $14,1M | time acima do teto assina UM agente livre de fora até esse valor |
| Contrato mínimo (`MINIMUM_CONTRACT`) | $3M | já existia — sempre permitido |

- **Preço de mercado.** Todo contrato novo (agência livre, renovação, extensão)
  sai por `expectedSalary(ovr, idade)` — a mesma curva que o pipeline usou para
  gerar os salários e que o `contractFactor` das trocas já lê. Ao virar agente
  livre, o `salary` do jogador passa a ser o pedido dele.
- **Direito de renovação.** Um time sempre pode renovar o próprio jogador, mesmo
  acima do teto (`Player.birdTeamId` marca de quem é o direito enquanto ele está
  no mercado).
- **CPU renova com critério**: só quem está entre os 9 mais valiosos do elenco,
  quer ficar (ânimo; a Estrela num time perdedor quer testar o mercado), e só até
  a linha de imposto — estrela 85+ pode passar dela.
- **O mercado esfria.** Quem ninguém pôde pagar baixa o pedido para a exceção de
  nível médio numa segunda rodada da CPU. Ninguém bom fica a temporada sem time.
- **Necessidade paga mínimo.** Time abaixo de 8 jogadores assina pelo mínimo.

## Fases

**Fase 1 — economia.** Os itens acima, sem UI nova além do que já existe.
Portão no `check_contracts`: nenhum jogador 80+ termina o verão sem time; a folha
mediana fica estável ano a ano (não colapsa nem explode); o pool de agentes
livres não cresce sem limite; `salário ÷ valor` dos 80+ fica perto de 1.

### Fase 1 — FEITA. Resultado (3 carreiras × 8 anos)

| ano | folha mediana | times > teto | 76+ parados no mercado | 80+ vencendo: ficam / trocam / **sem time** | salário ÷ valor |
|---|---|---|---|---|---|
| 1 | $192M | 28,7 | 0 | 22: 9 / 13 / **0** | 0,91 |
| 4 | $182M | 21,3 | 0 | 62: 34 / 28 / **0** | 0,88 |
| 8 | $154M | 13,3 | 0 | 43: 21 / 21 / **0** | 1,01 |

Os portões do `check_contracts` passam, e `check_decisions`, `diagnose_season`
(0 de 23), `check_personality` e `check_watch_director` seguem verdes.

Três coisas que a medição mudou no caminho:

- **O agente livre do usuário era roubado no desconto.** Com o mercado
  esfriando, a CPU levava os jogadores dele pela exceção de nível médio antes de
  o usuário ter a vez dele. Agora quem quer voltar (tem `birdTeamId` do usuário)
  não esfria: a CPU só o leva pagando o preço cheio. O que o usuário deixar sem
  assinar é liberado no `startSeason`, que dá ao mercado uma última rodada.
- **Quem não quer ficar sai sem direito de renovação.** Ânimo abaixo de 40 (ou a
  Estrela num time perdedor) vai ao mercado sem `birdTeamId` — medido, isso é
  5-10% dos jogadores 76+ da liga e cerca de metade dos de times com menos de 40%
  de vitórias.
- **A folha mediana desce devagar ($192M → $154M em 8 anos)** e não é o
  contrato: o top-8 médio da liga cai de 81,6 para 78,6 no mesmo período. Não
  existe aposentadoria e os calouros entram fracos, então a liga envelhece e o
  salário acompanha o valor (salário ÷ valor fica em ~1). Isso também faz o pool
  de agentes livres crescer (~40 por ano, todos abaixo de 76). Fora do escopo
  deste item — anotado no ROADMAP.

**Fase 2 — a decisão.** Extensão de contrato na fila de decisões: um jogador da
sua rotação entra no último ano → "estender agora por $X/N anos" ou "deixar ele
chegar na agência livre". O preço é o de mercado *hoje*; esperar é apostar que
ele cai (fica mais barato) contra o risco de ele subir ou ir embora. Ele pode
recusar a extensão (ânimo baixo, Estrela em time perdedor). Quem não estendeu
aparece no topo da Agência Livre com o direito de renovação — mas a CPU escolhe
antes. Custo de pagar demais: imposto acima de $187,9M cobra confiança do dono,
dito na própria opção. Portão: `check_decisions` continua em 4-8 por temporada.

**Fase 3 — visibilidade.** "Último ano" no elenco, linha de imposto nas barras de
folha, dinheiro morto ao dispensar.
