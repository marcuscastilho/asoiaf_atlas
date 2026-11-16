# Atlas — piloto local

Visor navegavel em Leaflet (CRS.Simple) para os mapas do projeto, isolado
em `/atlas/` e sem tocar no portal existente nem nas imagens mestres.

## Como servir

O atlas usa caminhos relativos para `../assets/vendor/leaflet/` e para a
previa em `assets/`, portanto **deve ser servido
da raiz do projeto**:

```
npx http-server . -p 8080 -c-1 -a 127.0.0.1
# depois: http://127.0.0.1:8080/atlas/
```

O `-a 127.0.0.1` mantem o servidor acessivel apenas na propria maquina.

## Estado atual (honesto)

- Exibe `assets/o-mundo-conhecido-recorte-v1-preview.webp`, uma **previa
  reduzida** (1600x1066) do mapa "O Mundo Conhecido" ja recortada.
  Nao baixa o JPEG mestre.
- A resolucao nativa (tiles WebP locais) e carregada sob demanda pelo
  botao "Carregar tiles".
- O mapa ocupa a largura total; o painel "Explorar Atlas" flutua sobre
  ele (recolhivel pelo botao do cabecalho, recolhido por padrao em
  telas de ate 700px). A imagem inicia **preenchendo o quadro**
  (recortada, nao reamostrada nem distorcida); afaste o zoom ou arraste
  para ve-la inteira. A navegacao e por zoom, arraste e tela cheia —
  nao ha botoes de enquadramento.
- Os nomes visiveis fazem **parte da imagem escaneada** — sao impressos e
  independentes das camadas interativas. Estas ultimas sao apenas o
  conjunto limitado do piloto abaixo. O filtro por capitulo afeta apenas
  essas sobreposicoes; nao oculta nomes impressos nem confirma as rotas.
- O atlas exibe 240 localidades com calibracao **manual em revisao**
  (`data/atlas-percursos-v6.json`, `schemaVersion: 2`): 217 com nome
  proprio associado, 5 membros do conjunto Cinco Fortes identificados
  apenas em grupo (sem nome individual inventado) e 18 simbolos com
  descricao geografica honesta e sem nome proprio informado — estes
  recebem pino vazado cinza e nunca identidade inventada. Nem toda
  localidade do mapa esta marcada e nenhuma cobertura e reivindicada
  como completa.
- Os trajetos sao **aproximados** de 27 personagens ao longo dos **5
  livros publicados** (344 capitulos de leitura): 133 trechos parciais e
  157 referencias de posicao. Nao sao 27 itinerarios auditados por
  completo: cada perfil exibe, por livro, a nota editorial de cobertura
  (`bookCoverage`, 135 celulas) redigida no conjunto — texto honesto,
  sem percentuais nem selo de "completo". Linhas sao corredores
  aproximados, nao caminhos exatos medidos.
- Os livros limitam o spoiler por faixa: AGOT 0-72, ACOK 73-142,
  ASOS 143-224, AFFC 225-270, ADWD 271-343. Trocar de livro salta ao
  primeiro capitulo dele; "Ver livro completo (spoilers)" para no fim
  do livro selecionado, nao sempre no 343.
- Sem rede externa, fontes externas ou CDN — somente `assets/vendor/leaflet`
  ja versionado no repositorio.

## Conjunto de dados

### v6 — percursos da saga (atual)

- `data/atlas-percursos-v6.json`: 240 pontos, 27 perfis, 5 livros,
  344 capitulos, 133 segmentos, 157 posicoes, 135 celulas de cobertura
  por livro. Limites e resultado das verificacoes finais em
  `data/PERCURSOS-V6.md`; resumo da revisao de nomes em
  `data/NOMES-V5.md`.
- `data/nomes-percursos-v6-evidencias.json`: os mesmos 115 registros
  historicos de ocorrencia exata de nomes (LeYa, AGOT) — o v6 **nao**
  amplia a certificacao de nomes. Carregado sob demanda na secao
  "Fontes e limites".
- `data/percursos-v6-diagnostico.json`: diagnostico da revisao de
  percursos que acompanha a publicacao.

### Versoes anteriores (congeladas, retaguarda)

- A interface carrega o primeiro dataset **presente** na cascata
  `v6 -> v5 -> v4 -> v3 -> v2 -> v1` e desce **somente** em HTTP 404 —
  um dataset presente mas invalido trava os controles sem rebaixar
  silenciosamente.
- `data/atlas-inventario-v5.json` (nomes revisados, mesma geometria de
  trajetos do v4), `data/atlas-inventario-v4.json` (saga completa),
  `data/atlas-inventario-v3.json`, `data/atlas-agot-v2.json` e
  `data/piloto-norte.json` (schema 1) permanecem congelados como
  retaguarda e fixtures de teste. Arquivos `*-candidato.json` e
  `pre-*` sao insumos congelados da pipeline e tambem permanecem.

## Recorte (derivado, mestre preservado)

- O recorte remove **somente a faixa em branco do scanner** no topo da
  imagem orientada: `cropBoxOriented = [0, 2336, 21654, 16764]`.
  Largura total, moldura, titulo e creditos na base permanecem intactos.
- O JPEG mestre nao e tocado: tudo e derivado novo
  (`tileSetId: o-mundo-conhecido-recorte-v1`). A piramide antiga sem
  recorte continua **preservada localmente** em
  `atlas/tiles/o-mundo-conhecido/`, mas fica **fora do repositorio** —
  apenas a piramede recortada ativa e versionada.
- O manifesto publica `displayToOrientedOffset = [0, 2336]` para
  converter coordenadas da tela recortada de volta a imagem orientada —
  base da calibracao futura.

## Tiles nativos (gerados e validados)

- Build concluida e validada pelo pipeline: `nativePixelsValidated: true`
  e fonte preservada inalterada (`sourceUnchanged`).
- Imagem exibida **21654x14428 px** (apos o recorte), tiles de 512 px,
  **1698 tiles** em **7 niveis de zoom** (0 a 6), distribuicao por nivel
  `[1, 2, 6, 24, 88, 330, 1247]`.
- O carregamento e **manual**: o botao "Carregar tiles" busca
  `data/mapa.json` e ativa a camada `L.tileLayer` com `tileSize`,
  `minZoom`, `maxNativeZoom`, `maxZoom`, `tileUrl`, `width`, `height` e
  `sourceSha256` do manifesto (o hash entra como query `?v=` para
  invalidar cache). O painel interativo tambem consulta o manifesto na
  abertura. Se ele estiver ausente, o painel informa a falha e a previa
  permanece navegavel; os tiles continuam dependendo da acao manual.

Os 1698 tiles ja vem incluidos no repositorio — **nenhuma geracao e
necessaria para rodar**. O historico de build existia apenas para
recriar os tiles a partir dos mestres:

```
.\.venv-book-audit\Scripts\python.exe -u .\atlas\scripts\build_tiles.py
```

Atencao: o pipeline historico e **incompleto fora da maquina original** —
`build_tiles.py` importa `mapas/relatorios/converter.py` e le
`renomeacao-jpeg.json`, e `mapas/relatorios/` nao esta no repositorio.
Regerar tiles exige os insumos privados do autor (mestres JPEG locais,
auxiliares nao publicados); isso nao e necessario para servir os tiles
ja incluidos. Nao se afirma reproducibilidade de geracao nova.
