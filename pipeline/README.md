# Pipeline de dados

Gera os dados reais que o jogo lê em `data/eras/`: ratings, elencos, transferências entre
temporadas, classes do draft e as campanhas reais usadas pelos testes.

O pipeline original (`nba-gm-simulator/pipeline`, em Python) nunca foi para o Git e se
perdeu numa formatação em 2026-11. Este é uma **recriação**: as regras documentadas no
ROADMAP (item 6, "Eras no modelo do Basketball-Reference") foram mantidas, e os números
foram reajustados contra os ratings que o original deixou nas 41 eras. Agora ele fica no
repositório.

## Ele não baixa nada

O Basketball-Reference e o `stats.nba.com` recusam acesso automatizado. O original passava
por isso fingindo ser um navegador Chrome (`curl_cffi`, `impersonate='chrome'`). Este
projeto não faz isso. As páginas são **salvas à mão, pelo navegador**, e o pipeline só lê os
arquivos:

1. Abra a página no navegador.
2. `Ctrl+S` → "Página da Web, somente HTML".
3. Salve em `.bbref-cache/` (ignorada pelo Git) com o caminho da URL trocando `/` por `_`:
   `https://www.basketball-reference.com/leagues/NBA_2021_advanced.html` →
   `.bbref-cache/leagues_NBA_2021_advanced.html`.

Outra pasta: variável `BBREF_PAGES`. Se faltar uma página, o script diz qual URL abrir e
com que nome salvar, e não grava nada.

O cache que sobrou do original tem as páginas de estatísticas avançadas de 30 temporadas
(1980 a 2019, faltam 1988, 1992, 1997, 2000, 2005, 2009-2012, 2018 e 2020).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `bbref.py` | Lê as páginas salvas (só biblioteca padrão): tabela de estatísticas avançadas, siglas dos times → ids do app |
| `ids.py` | Ids dos jogadores (`Nikola Jokić` → `nikola_jokic`), casamento entre fontes (sem Jr./Sr./II, iniciais juntas), leitura das eras |
| `model.py` | Estatística → rating: OVR, ataque, defesa, uso, TS%, os 7 atributos, potencial, salário |
| `calibrate.py` | Ajusta os parâmetros do `model.py` contra os ratings das eras e grava `params.json` |
| `params.json` | Os parâmetros ajustados (lidos pelo `build_season.py`) |
| `build_season.py` | Gera uma temporada (`players.json`, `teams.json`) e as transferências do verão anterior; `--validate` reconstrói uma era que já existe e compara |
| `build_extras.py` | Classe do draft (`draft_class.json`) e campanhas reais (`scripts/fixtures/era_records.json`) |
| `explore.py` | Relações entre estatísticas e ratings, para estudar o modelo |
| `stats.py` | Correlação, mínimos quadrados, mapeamento por quantil (sem numpy) |

Python 3 puro, sem dependências.

## O modelo

- **OVR:** BPM encolhido para a média pelos minutos (`bpm_k` minutos de jogador médio somados
  a cada um), com a temporada anterior entrando com peso menor (o ROADMAP fala em metade; o
  ajuste deu 0,25, com diferença mínima), e depois **mapeado na distribuição de OVR da própria
  era** (a ordem vem do BPM, a escala vem da era). O encolhimento forte que o ajuste encontrou
  (`bpm_k` alto) quer dizer que o original pesava muito os minutos jogados.
- **Ataque e defesa:** linha reta no OBPM e no DBPM encolhidos.
- **Uso e TS%:** USG% e TS% encolhidos para a média da liga (`usg_k`, `ts_k`).
- **Atributos:** uma regressão linear para cada um, sobre TS%, 3PAr, FTr, ORB%, DRB%, TRB%,
  AST%, STL%, BLK%, TOV%, USG%, OBPM e DBPM. Com menos de 250 minutos, todos ficam em 66, como
  nas eras.
- **Potencial:** A/B até 23 anos, C até 29, D a partir de 30.
- **Salário:** sintético, na escala do teto atual, `e^(a + b·OVR)` ±10%.
- **Quem os dados já conhecem** mantém id, `nbaId`, foto, altura, peso, número e cor de pele.
  Quem é novo ganha altura e peso médios da posição e as iniciais no lugar da foto.

### Quanto ele reproduz o original (`python pipeline/calibrate.py`)

Contra as 30 temporadas do cache:

| Rating | Concordância | Erro médio |
|---|---|---|
| OVR | Spearman 0,944 | 1,6 ponto |
| Ataque | r 0,988 | 0,4 |
| Defesa | r 0,966 | 0,3 |
| Uso | — | 0,56 p.p. |
| TS% | — | 0,009 |
| Armação / rebote | r 0,975 / 0,982 | 1,4 / 1,3 |
| Finalização | r 0,904 | 2,5 |
| Defesa de perímetro / interior | r 0,867 / 0,865 | 2,9 / 3,1 |
| Arremesso / atleticismo | r 0,846 / 0,811 | 3,0 / 2,4 |

O arremesso é o mais fraco: o original devia usar % de 3 e de lance livre, que não estão na
página de estatísticas avançadas.

`python pipeline/build_season.py <ano> --validate` em 1989-90, 2003-04, 2014-15 e 2016-17:
99-100% dos jogadores no mesmo time, OVR com Spearman 0,95, força dos times (powerRank) com
Spearman 0,92-0,97, e 93-99% das transferências do verão iguais às que os dados têm.

## E5: as temporadas de 2020-21 a 2024-25

Páginas para salvar (15, mais uma opcional):

| Para quê | URLs |
|---|---|
| Estatísticas | `leagues/NBA_2020_advanced.html` (só para pesar a temporada anterior de 2020-21), `NBA_2021_advanced` ... `NBA_2025_advanced` |
| Drafts | `draft/NBA_2020.html` ... `draft/NBA_2024.html` (e `NBA_2025` para ligar com a liga atual) |
| Campanhas reais (testes) | `leagues/NBA_2021_standings.html` ... `NBA_2025_standings.html` |

Todas em `https://www.basketball-reference.com/`. Depois, para cada temporada, em ordem:

```bash
python pipeline/build_season.py 2021 --id bucks-giannis-2020-21
python pipeline/build_extras.py draft 2020
python pipeline/build_extras.py records 2021
```

(`build_season` grava a era nova e as transferências do verão no `offseason_moves.json` da era
anterior. `build_extras draft 2020` grava a classe que entra entre 2019-20 e 2020-21 na pasta de
2019-20.)

Por fim, registrar cada era em `data/eras/index.ts` (imports + uma entrada em `ERAS` com
`label`, `seasonLabel` e `blurb`, como as outras) e no grupo de eras, e rodar
`scripts/check_eras.ts` e `scripts/check_era_chain.ts`.

**Ainda não testado com páginas reais:** os leitores do draft e da classificação
(`build_extras.py`), porque nenhuma dessas páginas estava no cache. Eles falham com mensagem
clara se a tabela não for encontrada.

## E6: as trocas reais do prazo

Achado da recriação: os elencos das eras são **os do fim de cada temporada** (cada jogador no
último time em que jogou). As transferências do verão comparam esses elencos, e foi assim que
a validação bateu 93-99%. Portanto uma troca real do prazo **já está embutida** no elenco com
que a temporada começa (o Rasheed Wallace já abre 2003-04 no Pistons).

Para o E6 de verdade, cada era teria que começar com o elenco do primeiro dia, e as mudanças
no meio da temporada aplicadas no prazo. `build_season.deadline_moves()` já extrai essas
mudanças da própria página de estatísticas (quem jogou por mais de um time, na ordem), mas
isso só é possível para as temporadas com página salva (hoje 30 de 41), e mudaria todos os
elencos das eras. Fica como decisão.

## O que o original fazia e ainda não foi recriado

- Carreiras reais para os marcos (`sync_careers.py`) e ex-times para as revanches
  (`sync_former_teams.py`): os dados atuais continuam valendo; temporadas novas ficariam sem.
- Fotos por time e temporada: `scripts/sync_era_photos.js` e `scripts/build_photo_index.js`
  (no repositório) consultam a CDN da NBA.
- Posições, alturas e pesos do Basketball-Reference: `scripts/fetch_bbref_positions.py`
  (no repositório, mas usa `curl_cffi` fingindo ser o Chrome; deve passar a ler páginas
  salvas como este pipeline antes de ser usado de novo).
- A liga atual (`data/players.json`, 2025-26): recalibrada pelo original em 2026-10-06; este
  pipeline gera eras, não a liga atual.
