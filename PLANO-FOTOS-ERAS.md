# Fotos dos jogadores pela era — plano

Pedido do usuário em 2026-10-17: o rosto do jogador deve ser o da época em que ele está
jogando, não a foto mais recente.

**Andamento (2026-10-17):** aprovado com o fallback "foto atual com tratamento de época".
**Fases 1 e 3 feitas**, junto com o fallback. Falta conferir no aparelho; as fases 2 e 4
ainda não começaram.
- `scripts/sync_era_photos.js` (Node, neste repositório) grava `photoUrl`, `photoYear` e
  `photoOffEra` nos `players.json` das eras.
  - Patch de texto: só mudam as linhas da foto. O resto do arquivo, inclusive `25.0` e
    CRLF, fica como o pipeline gravou.
  - Rodar de novo dá o mesmo resultado.
  - As respostas da CDN ficam em cache em `scripts/fixtures/photo_probe.json`: a primeira
    execução fez 2.412 consultas em ~8 min; as seguintes levam segundos.
- **Cobertura:**
  - 2015-16 a 2019-20: 92-96% com a foto exata do time e da temporada; o resto fica com a
    temporada mais próxima.
  - 2014-15: 366 de 450 com a foto de 2015-16 (diferença de 1 temporada, sem tratamento).
  - 1996-97 a 2013-14: quem jogou depois de 2015 ganha a foto oficial mais antiga (2015+),
    preferindo o time da era, e fica com `photoOffEra`. São de 2 jogadores (1996-97) a
    330 (2013-14), até 60 do top 60.
  - 1979-80 a 1994-95: sem mudança.
- **Tratamento** (`components/ui/PlayerPhoto.tsx`, agora usado por todas as 16 fotos de
  jogador do app):
  - `filter` sépia, menos saturação e mais contraste (web e Android; o iOS ignora);
  - tom quente por cima;
  - granulado (`assets/photo-grain.png`, repetido);
  - moldura creme de card, a partir de 44 px.
  - Conferido no navegador com o Heat de 2010-11: Wade, LeBron e Bosh com tratamento;
    Bibby e Dampier com a foto clássica.
- **Limite:** saves já começados guardam os jogadores antigos. As fotos novas valem para
  carreiras novas nas eras. Um `photoOffEra` não some se o save avança anos: isso é a
  fase 2.

## Como é hoje

- `getPlayerImageUrl` (`constants.ts`) usa `Player.photoUrl`, que em todas as 41 eras é
  `cdn.nba.com/headshots/nba/latest/1040x760/{nbaId}.png`: a **última** foto oficial do
  jogador.
- A mesma foto alimenta o `skinTone` do 3D (`sync_physical.py`). Ele não precisa mudar,
  porque a pessoa é a mesma.

## O que foi medido (2026-10-17)

**1. A NBA tem foto por time e temporada, mas só de 2015-16 em diante.**
`cdn.nba.com/headshots/nba/{teamIdNBA}/{ano}/1040x760/{nbaId}.png`, com `ano` = ano em que
a temporada começa:
- LeBron: Cavaliers 2015, 2016 e 2017 ✓ e Lakers 2019 e 2023 ✓.
- Cavaliers 2014, Heat 2010-2013, Kobe 2003-2014, Duncan 2010-2013, Jordan 1995-97 e
  Iverson 2001: todos 403.
- Time errado também dá 403 (LeBron nos Cavaliers em 2018). Isso confirma que a foto é
  daquele time naquela temporada.

**2. Para quem se aposentou antes de 2015, a foto "latest" já é da época certa.**
É uma foto clássica com o uniforme da carreira: Jordan no Bulls, Bird no Celtics. As eras
de 1979-80 a 1994-95 não têm o problema.

**3. O problema está em quem jogou depois de 2015.**
A foto deles é de fim de carreira, às vezes com outro uniforme: o LeBron de 2010-11 aparece
com 40 anos no Lakers. Entre os 60 melhores (OVR) de cada era, quantos estão nessa situação:

| Eras | Afetados no top 60 | Exemplos |
|---|---|---|
| 1979-80 a 1995-96 (17) | 0 | — |
| 1996-97 a 2002-03 (7) | 1 a 10 | Garnett, Duncan, Pierce, Kobe, Carter |
| 2003-04 a 2014-15 (12) | 17 a 60 | LeBron, Wade, Chris Paul, Durant, Rose, Curry |
| 2015-16 a 2019-20 (5) | todos | **dá para trocar pela foto exata** |

No total são 16.121 jogadores nas eras, 3.069 pessoas diferentes.

**4. Wikimedia Commons (fotos livres, com crédito): só serve para as estrelas.**
- Existem pastas por ano para LeBron (2008 e 2011).
- Não existem para Garnett 2008, Paul 2009, Pierce 2004, Wade 2006, Rondo 2010 nem Kobe
  2001.
- As fotos são de jogo, não de estúdio: precisam de recorte no rosto e de crédito.

**5. Fontes descartadas:**
- Getty e cards: têm direito autoral e são pagas.
- ESPN: só tem a foto mais recente.
- Basketball-Reference: uma foto por jogador, e os termos de uso proíbem raspagem.

## Fases

| Fase | O que entrega | Tamanho |
|---|---|---|
| **1. Foto exata de 2015-16 em diante** | Nas 5 eras de 2015-16 a 2019-20, cada jogador ganha a foto oficial do time e da temporada. Quem não tiver (troca no meio do ano, novato sem foto) fica com a do mesmo time na temporada mais próxima e, por último, com a `latest`. | P |
| **2. A foto acompanha o save** | Numa carreira que avança (começa em 2015-16 e joga até 2020), a foto muda com a temporada e com o time dele no save. | M |
| **3. 1996-97 a 2014-15: a foto oficial mais próxima** | Para quem jogou depois de 2015, usar a foto oficial **mais antiga** que existir (2015-16), de preferência do mesmo time. É a foto mais próxima da época, embora ainda não seja dela. | P |
| **4. Estrelas de 1996-2014 pelo Commons (teste antes)** | Foto livre do ano certo para as estrelas, com recorte no rosto e crédito numa tela "Créditos das fotos". Só vale a pena se cobrir boa parte do top 60 dessas eras (meta ≥ 50%); o teste mede isso antes. | M |
| Fallback | Quem ficar sem foto da época mantém a atual (decisão abaixo). | — |

### Fase 1 — detalhes

- **Script do pipeline** `sync_era_photos`. Para cada era de 2015 em diante e cada jogador:
  testa a URL do time e da temporada com HEAD. Se não existir, tenta outras temporadas do
  mesmo time, depois qualquer time, e por último a `latest`. Grava `photoUrl` no
  `players.json` da era.
- **Tabela fixa** com as siglas do app e os ids de time da NBA (`chi` → 1610612741...). Times
  que mudaram de cidade mantêm o id da franquia.
- **Volume:** ~2.400 jogadores-temporada, a ~5 por segundo, dá menos de 10 minutos.
- **Medição:** porcentagem de fotos exatas por era, com meta ≥ 90% no top 60.
- **Mudança no app:** nenhuma. `photoUrl` já é o que o app lê.

### Fase 2 — detalhes

- **Arquivo novo** `data/photos.json`: `nbaId → [[ano, teamIdNBA], ...]`, só com as
  combinações que existem de 2015 a 2025. Fica pequeno, porque a URL se monta a partir
  desses dados.
- **`getPlayerImageUrl(p, season?)`:** com o ano da temporada do save e o time atual do
  jogador, escolhe a foto do mesmo time mais próxima, sem passar da temporada atual. Sem
  dados, usa a `photoUrl`.
- **Chamadas:** passar a temporada nos pontos de uso (`PlayerFace` e listas). É o trecho
  que mexe em mais telas.
- **A liga atual (2025-26) também ganha:** se você trocar um jogador, a foto passa a ser do
  time novo quando ela existir.

### Fase 3 — detalhes

O mesmo script, com outra regra para as eras de 1996-97 a 2014-15: se o jogador tiver foto
por temporada (jogou depois de 2015), usar a temporada mais antiga com foto, preferindo o
time em que ele estava na era.

### Fase 4 — detalhes (teste antes)

- **Teste:** pegar o top 60 de 3 eras (2003-04, 2008-09, 2012-13) e procurar no Commons
  `Category:<nome> in <ano>`, e também arquivos do jogador com data em ±1 ano. Medir quantos
  têm foto utilizável, com o rosto de frente e em boa resolução.
- **Se passar:**
  - recorte no rosto feito no pipeline, com detecção de rosto;
  - fundo neutro;
  - fotos guardadas num repositório próprio ou no GitHub Pages: o Commons não é CDN
    para o app puxar direto;
  - tela de créditos com autor e licença de cada foto, que a CC BY-SA exige.

## Decisões em aberto

1. **Fallback para quem não tem foto da época** (só nas eras de 1996 a 2014):
   - manter a foto atual, mesmo mais velha (recomendo);
   - foto atual com um tratamento de época (granulado, moldura de card);
   - silhueta com as iniciais.
2. **Onde fica o script.** O pipeline (`nba-gm-simulator/pipeline`) não está nesta máquina.
   Ou ele é clonado, ou o script vai para `scripts/` deste repositório, em Node, como os
   `check_*`.
3. **Fase 4 entra ou não**, depois do teste.

## Ordem sugerida

Fase 1 → 3 → 2 → (teste da 4).

As fases 1 e 3 são só dados: o mesmo script, nenhuma mudança no app, e resolvem quase tudo
que aparece na tela. A fase 2 só faz diferença em saves que avançam vários anos.
