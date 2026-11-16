# Cobertura de tradução (pt-BR, fonte primária: Suma 2019)

Política: nunca inventar traduções. O que não tem fonte verificada fica em
inglês e é listado explicitamente aqui.

**Fontes:**
- `reference/translations.wiki` — Apêndice de traduções da Game of Thrones
  Wiki pt-br (prioriza Suma 2019 sobre LeYa 2011 e dublagem).
- **Livros locais do usuário** — auditoria dirigida de nomenclatura
  (2026-11-01, não exaustiva): `docs/local-book-reference.json`.
  O PDF de *A Fúria dos Reis* é **Suma** (ISBN 9788554514020, ficha na
  página 1050 do arquivo; ano do catálogo digital, não a data de criação
  do PDF). Os cinco EPUBs principais são **LeYa** 2010–2012 — formatos e
  edições diferentes, então termos LeYa não contam como prova Suma.
  PDF de *O Festim dos Corvos* e EPUB de *Os Ventos do Inverno* foram
  **excluídos como prova editorial** (agradecimentos/aviso de tradução de
  fãs). Localizadores: `pdfPage` = página do arquivo PDF (não a paginação
  impressa); `epubMember` = arquivo interno do EPUB (não número de capítulo).
- `wiki.geloefogo.com` — wiki literária em português; usada como fonte
  secundária. As correspondências usam interlinks `[[en:...]]`, conteúdo
  dos artigos e cadeias de redirecionamentos, conforme o caso. Evidência
  termo a termo: `docs/translation-sources.json`.
- Capítulos: infocaixas de capítulo do geloefogo (campo `| título =`),
  que espelham os títulos publicados pela Suma.

## 1. Glossário verificado pelo apêndice

`assets/js/i18n-pt.js > glossary` — Casterly Rock=Rochedo Casterly,
Castle Black=Castelo Negro, Eyrie=Ninho da Águia, King's Landing=Porto Real,
Kingswood=Mata de Rei (não "Mataderrei"), Night's Watch=Patrulha da Noite,
Red Keep=Fortaleza Vermelha, Tower of the Hand=Torre da Mão,
Direwolf=Lobo gigante, Doom of Valyria=Destruição de Valíria, Dornish sand
steed=Corcel de areia de Dorne, Dusk rose=Rosa-penumbrosa, Harpy's gold=
Ouro de harpia, Ironborn=Homens de ferro (alias Nascidos no ferro),
Hand of the King=Mão do Rei, Lady's Lace=Renda-de-senhora, Long Night=
Longa Noite, Old Gods of the Forest=Deuses Antigos da Floresta, White
Walkers=Caminhantes Brancos, Unbowed, Unbent, Unbroken=Insubmissos,
Imbatíveis, Inquebráveis, First of His Name=Primeiro de Seu Nome, King of
the Andals and the First Men=Rei dos Ândalos, dos Roinares e dos Primeiros
Homens, Protector of the Realm=Protetor do Território.

## 2. Localidades traduzidas

Em `i18n-pt.js > towns`: a lista curada original **mais** as verificadas
no geloefogo (Gulltown=Vila Gaivota, Duskendale=Valdocaso,
Sisterton=Vilirmã, Stony Shore=Costa Pedregosa, Hornvale=Valecorno,
Ten Towers=Dez Torres, Fairmarket=Feirajusta, todos os castelos da
Muralha com nome verificado, etc.) **mais** 13 rótulos descritivos
traduzidos como descrições (não são topônimos oficiais):
Esconderijo da Irmandade sem Bandeiras, Estalagem (Eles se deitam com
leões), Vilarejo sem nome, Fortaleza de Lorde Lychester, A Senhora das
Folhas, Vila de Lorde Goodbrook, Fortaleza da execução, Vila da Paliçada,
Castelo Goodbrother, Casa Baelish, Estalagem da Hera, Fortaleza do Olho
de Deus, Septo saqueado.

### Resolvidos online em 2026-11-01 (fonte secundária — ver seção 3.1)

- **Torches → Archotes** — castelo abandonado da Muralha; langlink
  direto `[[en:Torches]]` no artigo "Archotes".
- **Hollow_Hill → Monte Oco** — caverna da Irmandade; langlink
  `[[en:Hollow hill]]` (caso-insensível). Alias de busca "Colina Oca"
  (prosa descritiva do artigo
  [Arya Stark](https://wiki.geloefogo.com/index.php/Arya_Stark), não o
  título do artigo "Monte Oco").
- **Sunflower_Hall → Solar de Girassol** — preferido pela evidência
  direta LeYa em AFFC, arquivo interno `...vol4-59.xhtml`. A forma
  secundária "Casasolar" permanece como alias, sem confirmação Suma.
  A cadeia de alias, **não** um langlink direto, foi preservada:
  "Casasolar" liga para `[[en:Sunhouse]]` e a awoiaf redireciona
  Sunflower Hall → Sunhouse ("also called Sunflower Hall ... seat of
  House Cuy"). Aliases aceitos: Sunhouse, Casassolar, Cassolar.
- **Weeping_Tower → Torre dos Prantos** — infocaixa de "Vila Chorosa"
  lista `places=[[Torre dos Prantos]]`; "Torre dos Prantos" redireciona
  para a vila. **Ambiguidade mantida**: a fonte (awoiaf/Weeping Town)
  diz que a vila contém um assento "possivelmente conhecido como Weeping
  Tower" — torre ≠ vila e o nome é incerto; **nenhuma casa atribuída**
  (a afirmação anterior de "assento da Casa Mertyns" era incorreta:
  Mertyns é de Mistwood/Matabruma). O ponto legado do mapa é preservado.
- **Wyl_(Dorne) → Wyl** — nome próprio verificado **inalterado**
  (artigo "Wyl (Castelo)", langlink `[[en:Wyl (castle)]]`, Casa Wyl).
- **Donella_Manderly → Donella Manderly** — nome de nascença verificado
  no artigo "Donella Hornwood" ("nascida Donella Manderly", ACOK cap.16);
  nome de casada aceito como alias. **Removida** a alegação anterior de
  "marcador de tumba" — sem proveniência nos dados originais (só há
  coordenadas); o rótulo original é preservado sem revelação de trama.

## 3. Mantidos em inglês — nomes próprios canônicos

A própria wiki em português usa o mesmo nome — não são "não traduzidos":
Karhold, Winterfell, Hornwood, Pyke, Darry, Harrenhal, Sherrer, Castamere,
Sarsfield, Kayce, Stokeworth, Rosby, Hayford, Tumbleton, Bandallon,
Fawnton, Vaith, e todas as cidades livres/ruínas de Essos (Braavos, Lorath,
Tyrosh, Lys, Myr, Pentos, Ghoyan Drohe, Norvos, Qohor, Ar Noy, Ny Sar,
Selhorys, Valysar, Volon Therys, Sar Mell, Volantis, Mantarys, Bhorash,
Oros, Tyria, Velos, Ghozai, Tolos, Meereen, Yunkai, Astapor, Vaes Dothrak,
Lhazar, Vaes Tolorro, Qarth, Zamettar, Gogossos, Yeen).

### 3.1. Fontes online × edição impressa

Os seis itens acima foram resolvidos via **wikis online em português**
(fonte secundária), com evidência termo a termo em
`docs/translation-sources.json` e snapshot de wikitext em
`reference/translation-research-2026-11-01.json`. A auditoria de livros
locais (seção 3.2) acrescentou prova parcial de edição: **Archotes** e
**Monte Oco** aparecem nos arquivos LeYa do usuário; **Solar de Girassol**
(LeYa) passou a nome preferido de Sunflower_Hall na revisão de 2026-11-02;
**Ilha Silenciosa** continua como alias de Quiet_Isle.
"Torre dos Prantos" e o alias "Casasolar" continuam com evidência
literária secundária online. O apêndice Suma 2019 continua autoritativo em
caso de conflito; a verificação impressa é **parcial** — não se afirma
certificação integral.

### 3.2. Correções comprovadas em edição local (auditoria 2026-11-01)

Sete nomes preferidos corrigidos, com evidência copiada verbatim em
`docs/translation-sources.json > localBookEvidence` e decisões em
`docs/local-book-reference.json`:

| Chave | Preferido | Autoridade | Referência |
|---|---|---|---|
| Griffin's Roost | Poleiro do Grifo | Suma (PDF ACOK) | pdfPage 951 |
| Deep_Den | Toca Funda | Suma (PDF ACOK) | pdfPage 1038 |
| The_Crag | Despenhadeiro | Suma (PDF ACOK) | pdfPage 1038 |
| Starfall | Tombastela | Suma (PDF ACOK) | pdfPage 1040 |
| Sharp_Point | Ponta Afiada | Suma (PDF ACOK) | pdfPage 1016 |
| Acorn_Hall | Solar de Bolotas | LeYa (EPUBs ASOS/AFFC) | epubMember ×2 |
| Nightsong | Nocticantiga | LeYa (EPUBs ASOS/AFFC) | epubMember ×2 |

Na revisão de 2026-11-02, Sunflower_Hall passa a **Solar de Girassol**:
a evidência LeYa direta prevalece sobre a forma online "Casasolar",
sem confirmação Suma. "Casasolar" continua pesquisável.
Quiet_Isle mantém "Ilha Silenciosa" como alias (ambas as formas no
mesmo EPUB LeYa). Os rótulos anteriores viraram aliases de busca
(Ninho do Grifo, Toca Profunda, Penhasco, Queda da Estrela, Ponta Aguda,
Solar de Bolota, Canto Noturno).

Glossário: Kingswood permanece **Mata de Rei** (Suma, pdfPage 251 do
ACOK); a variante LeYa "Mataderrei" existe (AGOT EPUB) mas fica
**restrita a esta evidência documental** — não há chave de cidade
Kingswood nos dados, então não virou alias.

Verificação **parcial**: ausência de ocorrência em busca exata não prova
erro; a maioria dos demais termos segue com a evidência já documentada
(apêndice/online), sem certificação impressa.

### 3.3. Nova conferência do catálogo em 2026-11-09

Nove rótulos antes mantidos em inglês receberam evidência contextual nos
livros locais, sem consulta à série. Decisões e localizadores completos:
`docs/map-book-context-overrides.json`; aprovação explícita:
`docs/map-book-review.json`. Somente os termos e localizadores são
armazenados, não os trechos dos livros.

| Referência original | Nome exibido | Edição e localizador |
|---|---|---|
| Blacktyde (ilha) | Pretamare | ACOK-SUMA, PDF p. 413; também p. 1036 |
| Saltcliffe (ilha) | Salésia | ACOK-SUMA, PDF p. 413; também p. 1036 |
| Rose Road | Estrada das Rosas | ACOK-SUMA, PDF p. 165; também pp. 279 e 285 |
| Littlesister | Pequenairmã | ADWD-LEYA, membro interno terminado em `-14.xhtml` |
| Longsister | Longairmã | ADWD-LEYA, membro interno terminado em `-14.xhtml` |
| Broken Branch | Ramo Partido | ADWD-LEYA, membro interno terminado em `-34.xhtml` |
| Isle of Cedars | Ilha de Cedros | ADWD-LEYA, membro interno terminado em `-21.xhtml` |
| Khyzai Pass | Passo Khyzai | ADWD-LEYA, membro interno terminado em `-21.xhtml` |
| Ocean Road | Estrada do Mar | TWOIAF-LEYA, `index_split_021.html` |

Os sobrenomes Blacktyde e Saltcliffe não foram traduzidos: a decisão se
refere às ilhas. A referência à estrada do mar descreve a ligação entre
a Campina e Rochedo Casterly. Para as duas irmãs, AFFC-LEYA também traz
"Irmã Pequena" e "Irmã Longa"; foram adotadas as formas de ADWD-LEYA,
coerentes com "Doceirmã" já usado no catálogo. Isso não certifica uma
forma Suma para esses seis rótulos LeYa. Suma continua tendo precedência
quando há evidência identificada.

A busca continua aceitando os nomes originais em inglês, com os mesmos
IDs, coordenadas e destinos. Esta revisão é dirigida, não uma auditoria
integral de todos os topônimos.

## 4. Rótulos geográficos (camada "Nomes em português")

O catálogo incremental contém **208 instâncias de rótulos**, transcritas
das camadas originais: 172 de `labels.png` e 36 de `spec_labels.png`.
São **65 pontos originais** com rótulos posicionados a partir da arte
e **142 referências adicionais distintas**. Os outros **180 pontos**
originais mantêm os rótulos de fallback; nenhum dos 245 pontos foi removido.

Das referências adicionais, **113** têm o nome aprovado após leitura
da ocorrência em contexto nos livros identificados. **13** mantêm o
nome original sem tradução confirmada nesta revisão. Os demais nomes
próprios permanecem inalterados. Uma ocorrência genérica de palavra
(como "vago", "degraus" ou "febre") não foi aceita como prova de topônimo.

Fontes congeladas: `map-features.json`, `map-book-evidence.json`,
`map-book-context-overrides.json` e `map-book-review.json`, em `docs/`.
`tools/build-cartography.mjs` gera o catálogo e `docs/map-coverage.json`
sem reler os livros ou refazer OCR. Nenhum texto integral de livro é
armazenado no projeto.

As posições são centros aproximados dos rótulos na arte de 4642 pixels,
não coordenadas cartográficas certificadas. A apresentação usa tamanhos
limitados por categoria, contorno branco fino e arcos SVG em alguns nomes
longos. O posicionamento local evita colisões entre rótulos do catálogo e
de fallback sem alterar as coordenadas de origem; linhas-guia associam os
nomes de pontos deslocados aos respectivos símbolos. Os rótulos fora da
área visível podem ser ocultados; referências continuam na busca.
Nos zooms afastados (1 a 3), os nomes aparecem por nível de detalhe:
continentes e grandes mares primeiro, depois florestas e localidades
principais, e por fim referências menores ao aproximar. Nomes em conflito
podem ser ocultados nessa visão geral; a partir do zoom 4, o catálogo
detalhado volta a ser tratado como obrigatório. Isso não remove pontos,
traduções ou destinos de referência, nem altera a qualidade dos textos.
Os símbolos cheios e vazados da arte permanecem visíveis. O terreno foi
recomposto na resolução original de 4642 pixels, sem detalhe inventado.

**Não é uma auditoria integral do mapa.** URLs dos 245 pontos originais
foram preservadas. URLs novas são destinos literários inferidos:
seus redirecionamentos não foram verificados na rede.

## 5. Títulos de capítulos

- Livros: AGOT=A Guerra dos Tronos, ACOK=A Fúria dos Reis, ASOS=A Tormenta
  de Espadas, AFFC=O Festim dos Corvos, ADWD=A Dança dos Dragões,
  TWOW=Os Ventos do Inverno. `Prologue`=Prólogo, `Epilogue`=Epílogo.
- **Escopo real do dataset**: 5 livros publicados
  **+ 1 capítulo de amostra de TWOW** ("TWOW-?: Theon I"), exibido como
  "Os Ventos do Inverno (capítulo de amostra): Theon I".
- Epítetos de capítulo-POV: 35 títulos verificados nas infocaixas do
  geloefogo (`chapterWords`), incl. Kraken's Daughter=A Filha da Lula
  Gigante, The Reaver=O Pirata, The Watcher=O Sentinela, The Blind Girl=
  A Garota Cega, The Kingbreaker=O Derrubador de Reis, Reek=Fedor.
  Correção editorial: "The Queen's Hand" → "A Mão da Rainha" (o artigo do
  geloefogo tem o erro de gênero "O Mão").
- Capítulos com nome de POV (Bran I, Tyrion II, …) permanecem com o nome
  — idêntico aos livros publicados.
- O runtime é exclusivamente literário: a fonte original também trazia
  dados de episódios da série, que `tools/generate-data.mjs` filtra por
  completo (nenhum `episodes` é serializado em `assets/js/data.js`).

## 6. Personagens e casas

Asha Greyjoy (não "Yara"), Petyr Baelish (Mindinho), Brienne de Tarth,
Duncan, o Alto; demais nomes próprios mantidos. `House X` → `Casa X`;
`Night's Watch` → `Patrulha da Noite`; `mountain clan` → `Clã`.

## 7. Assets

- Todos os 263 brasões/símbolos referenciados têm arquivo local ou estado
  documentado no manifest; `House_Mormont` e `Dayne` foram substituídos
  por **arquivos genuínos atuais da awoiaf** (`house-mormont.svg`,
  `house-dayne.svg`) — ver campo `note` em `assets/heraldry/manifest.js`.
- Único item ainda indisponível: ícone `chart.googleapis.com` (não usado
  pela UI; permanece `failed` honesto).
- `question-mark.gif` nunca existiu no original (404) → marcador `?`
  neutro local (`assets/img/question-mark.svg`).

## 8. Licenças e atribuição

- Arte do mapa © theMountainGoat — Creative Commons, uso **não comercial**
  (aviso embutido no canto das imagens; `reference/NOTICE.md`).
- Código e dados do site original: **publicamente acessíveis, sem licença
  explícita encontrada** — este clone não reivindica licença sobre eles.
- IP de *As Crônicas de Gelo e Fogo*: George R.R. Martin.
