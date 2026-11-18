# asoiaf_atlas — Atlas de As Crônicas de Gelo e Fogo (pt-BR)

Projeto de fãs, sem fins comerciais, com dois mapas interligados:

- **Atlas** (`/atlas/`): visor em alta resolução do mapa "O Mundo Conhecido"
  de *As Terras de Gelo e Fogo*, com 244 localidades nomeadas em pt-BR,
  cards com resumo e link para a [AWOIAF](https://awoiaf.westeros.org/),
  27 regiões e 51 sub-regiões para navegação, percursos de 27 personagens
  nos 5 livros com filtro de spoilers por capítulo (trechos deduzidos em
  pontilhado amarelo) e rótulos automáticos.
- **Mapa principal** (`/`): clone em português (pt-BR), feito por fãs e sem fins lucrativos, do site
[Quartermaester](https://quartermaester.info/) — um mapa interativo de Westeros
e Essos com controle de spoilers por capítulo — escopo exclusivamente
literário, sem dados da série de TV.

As traduções priorizam a **editora Suma (2019)**, conforme o
[Apêndice de traduções da Game of Thrones Wiki (pt-br)](https://gameofthrones.fandom.com/pt-br/wiki/Game_of_Thrones_Wiki:Ap%C3%AAndice_de_tradu%C3%A7%C3%B5es).
Ver `docs/TRANSLATION-COVERAGE.md` para o que está traduzido, o que ficou em
inglês por falta de fonte verificada e os termos não resolvidos.

## Rodando

```sh
git clone git@github.com:marcuscastilho/asoiaf_atlas.git
cd asoiaf_atlas
npm ci
npm run serve        # http://localhost:8080
```

- `http://localhost:8080/` — portal original clonado (Quartermaester, pt-BR).
- `http://localhost:8080/atlas/` — **Atlas local**: visor Leaflet
  (CRS.Simple) sobre o mapa escaneado "O Mundo Conhecido", com
  localidades, regiões, percursos v7 (`atlas/data/atlas-percursos-v7.json`,
  gerados por `atlas/scripts/preparar-percursos-v7.py` a partir de
  `atlas/scripts/itinerarios_v7_fonte.py`). Detalhes em `atlas/README.md`.

Não é necessária nenhuma chave: por padrão o mapa usa **Leaflet** com os tiles
locais em `assets/tiles/`; o Atlas carrega automaticamente a prévia WebP em
`atlas/assets/` e os **1698 tiles nativos incluídos** em
`atlas/tiles/o-mundo-conhecido-recorte-v2/` (~400 MB no clone — é o mapa em
alta resolução, nada precisa ser gerado). Não estão no repositório: os
mestres JPEG (`mapas/jpeg/`), a pirâmide antiga sem recorte
(`atlas/tiles/o-mundo-conhecido/`), arquivos locais e segredos — nada
disso é necessário para rodar.

O Atlas cobre os **5 livros publicados** (344 capítulos de leitura).
Os percursos são contínuos por personagem; quando os livros não descrevem
o caminho exato, o trecho aparece como deduzido (pontilhado amarelo), sem
ser apresentado como rota confirmada. O portal na raiz mantém o escopo original:
os 5 livros **+ o capítulo de amostra TWOW-?: Theon I**, distinção que
permanece explícita nos dados do portal.

### Google Maps (opcional)

Para usar o renderizador original do site (Google Maps), crie a **sua própria**
chave da Google Maps JavaScript API e edite `config.js`:

```js
window.GOTMAP_CONFIG = { googleMapsApiKey: 'SUA_CHAVE_AQUI' };
```

O script oficial é carregado assincronamente com `language=pt-BR`; em caso de
erro de rede ou autenticação o site cai para Leaflet e mostra um aviso curto.
A chave exposta do site original **não** é usada nem incluída aqui.

## Arquitetura

```
index.html                 marcação adaptada do original (mesmos IDs/controles)
config.js                  { googleMapsApiKey: '' } -> Leaflet por padrão
assets/css/app-*.css       estilos do original (desktop + <=600px)
assets/js/core.js          helpers puros (keyhole, ranges, hash, busca) - testáveis
assets/js/data.js          dataset do original filtrado p/ material literário
                           (LatLng->[a,b], sem dados de episódios; ver
                           tools/generate-data.mjs)
assets/js/i18n-pt.js       dicionário central pt-BR (não traduz código/URL/chaves)
assets/js/map-engine.js    interface comum + implementações Leaflet e Google
assets/js/app.js           lógica do app (slider, personagens, regiões, busca…)
assets/vendor/             jQuery 1.9.1, jQuery Mobile 1.3.0, Leaflet 1.9.4
assets/tiles/{nat,fsm}/    2728 tiles no formato keyhole original (z1..z5)
assets/heraldry/           brasões locais + manifest.js (URL original -> arquivo)
assets/img/                setas do slider, menu, caveira, "?", bandeira
tools/download-assets.mjs  baixa tiles+brasões, resumível, concorrência <=4
tools/generate-data.mjs    regenera data.js a partir da referência
test/unit.test.js          node:test — keyhole, ranges, busca, hash, slider
scripts/smoke.mjs          Playwright — fumaça desktop+mobile com screenshots
scripts/screenshot.mjs     captura de página genérica (usado p/ referência)
reference/                 fontes originais baixadas (não alterar)
```

Camadas no canto superior esquerdo: **Nomes em português** (terreno fonte +
símbolos fonte + rótulos vetoriais localizados, padrão), **Sem nomes**
(terreno + símbolos, sem rótulos vetoriais), **Original (inglês)**
(tiles `fsm`, que já desenham os próprios símbolos). Os tiles `nat`
distribuídos **não** contêm os glifos da arte — o terreno em resolução
fonte (`terrain.jpg`, gerado por `tools/build-terrain.py` a partir das
camadas originais `map.jpg`+`roads`+`wall`+`non_canon`, sem recompressão
extra de tiles e sem detalhe inventado) e os símbolos
(`{locations,spec_locations}.png`, cópias das camadas RGBA do autor) são
restaurados como overlays não interativos.

A legenda abre por padrão no desktop (fechada no mobile, com botão
flutuante sempre visível). Os rótulos usam tipografia normalizada por
categoria (Georgia itálica, contorno branco, tamanhos limitados por zoom),
com deslocamento determinístico + linhas-guia quando necessário e texto
curvo (SVG textPath) para os nomes longos de mar/floresta — reduzindo
sobreposições sem descartar nenhum rótulo do catálogo em zooms detalhados
(z >= 4). Em zooms distantes
(z <= 3) o mapa mostra **detalhe progressivo**: continentes, grandes mares,
florestas e cidades principais primeiro, nomes menores aparecem ao
aproximar — a tipografia, os símbolos e o terreno em resolução fonte não
mudam, e todos os 245 pontos originais + busca completa continuam
disponíveis em qualquer zoom.

## Verificação

```sh
npm test        # testes unitários (node:test)
npm run smoke   # suíte de fumaça Playwright -> reference/local-*.png/.log
```

Últimas execuções (logs em `reference/`): `npm test` 19/19
(`book-unit.log`), `translation-smoke` 51/51, `bookonly-smoke` 27/27,
`cartography-smoke` 28/29 (`cartography-smoke.log` — a falha restante são
requisições de tiles **abortadas pelo navegador** em pans rápidos, não
erros HTTP). `npm audit` **não foi executado nesta iteração** (requer
rede). Modo Google não verificado (depende de chave própria do usuário).

## Correções em relação ao original

- Slider das setas é limitado antes de ler o título (antes estourava no fim).
- Brasões (nobreza) atualizam nas setas do controle de capítulos.
- "Somente posições atuais" esconde linhas **e** setas (antes só linhas).
- Selecionar personagem sem marcador atual não move o mapa para `null`.
- Aegon só existe na UI a partir do capítulo 289; em "selecionar todos"
  ele nunca é revelado (no original, vazava spoiler).
- Popup de cidade escolhe a casa vigente na faixa atual do controle (o
  original exibia a última casa que sobrescreveu o assento).
- `#@hash` desconhecido/malformado não quebra mais a página (handler de
  hash do jQuery Mobile desativado — o original lançava exceção).
- Sem Google Analytics, sem scripts da Cloudflare, sem chave de terceiros.
- Ícone "lost" (`question-mark.gif`) não existia nem no site original
  (404); usamos um marcador neutro `?` local.

## Limites honestos

- Brasões: todos servidos localmente. `House_Mormont` e `Dayne` foram
  perdidos na fonte original (404/host extinto) e **substituídos pelos
  arquivos genuínos atuais da awoiaf** (`house-mormont.svg`,
  `house-dayne.svg`, em `assets/heraldry/`) — ver `note` em
  `assets/heraldry/manifest.js`. Único item ainda `failed`: ícone
  `chart.googleapis.com`, não usado pela UI. Nenhum brasão foi inventado;
  falhas renderizam placeholder neutro de inicial.
- O mapa desenhado é **especulativo** (aviso do autor original mantido).
- Escopo dos dados idêntico ao original: 5 livros publicados **+ o
  capítulo de amostra `TWOW-?: Theon I`** — somente material literário
  (os dados da série presentes na fonte original são filtrados por
  `tools/generate-data.mjs`).
- URLs de clique: os **245 pontos originais** abrem exatamente a URL
  preservada da fonte (`loc.url` ou `awoiaf/<chave>`); rótulos do
  catálogo cartográfico (`assets/js/cartography.js`) podem carregar URLs
  **inferidas** como referências literárias — não são redirecionamentos
  originais preservados nem verificados na rede.
- Catálogo cartográfico (inventário congelado em `docs/map-coverage.json`):
  **208 instâncias de rótulos fonte** (172 de `labels.png` + 36 de
  `spec_labels.png`), **65** pontos originais com rótulo alinhado à fonte e
  **180** pontos originais ainda em rótulo de fallback; **142** referências
  distintas adicionais (das quais **113** com aprovação contextual de livro)
  e **13** traduções sem confirmação mantidas em inglês. São contagens de
  inventário incremental, **não** taxas de cobertura/completeza. As
  geometrias alinhadas à fonte são **centros manuais aproximados**
  transcritos da arte, não coordenadas levantadas.
- Tradução **não** é certificada 100%: nomes próprios canônicos que o
  próprio pt usa (Winterfell, Harrenhal, cidades livres…) ficam iguais;
  outras localidades foram resolvidas via **wikis online pt-BR** (fonte
  secundária). A verificação contra edições impressas é **parcial**: o
  usuário forneceu livros locais e a auditoria dirigida
  (`docs/local-book-reference.json`) confirmou 5 termos no PDF **Suma** de
  *A Fúria dos Reis* e 2 termos + 2 aliases nos EPUBs **LeYa** — marcas de
  edição distintas, não intercambiáveis. O apêndice Suma 2019 prevalece em
  conflito; os demais termos seguem sem certificação impressa. Detalhes:
  `docs/TRANSLATION-COVERAGE.md` e `docs/translation-sources.json`.
  Nenhum texto de livro é copiado para o repositório.
- Links externos (wiki) podem conter spoilers — o controle vale só para o mapa.

## Licenças e créditos

- Arte do mapa © theMountainGoat — Creative Commons, uso **não comercial**
  (aviso embutido no canto inferior esquerdo das imagens; ver
  `reference/NOTICE.md`).
- O **Atlas** (`/atlas/`) usa digitalizações de mapas **fornecidas pelo
  usuário** — material distinto da arte CC do portal: permanecem os
  direitos dos respectivos autores/editoras, os créditos impressos na
  arte são preservados e **não existe licença de uso livre universal**
  para essas imagens. Trate-as como material de referência incluído no
  contexto do projeto.
- Código/dados do site original: publicamente acessíveis, **sem licença
  explícita encontrada** — nenhum direito reivindicado aqui.
- Dados de trajetos/brasões: espelhados do site original (projeto de fãs).
- Leaflet © sua licença BSD-2 (`assets/vendor/leaflet/LICENSE`).
- jQuery/jQuery Mobile © licença MIT.
- Propriedade intelectual de *As Crônicas de Gelo e Fogo*: George R.R. Martin.

## Créditos

Ícone do favicon: "King" (trono), por Freepik — [Flaticon](https://www.flaticon.com/free-icon/king_15305679), licença gratuita com atribuição.
