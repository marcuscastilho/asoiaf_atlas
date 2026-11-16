# Percursos AGOT v1

## Escopo e limites

Revisao dos 12 personagens ja disponiveis no Atlas, exclusivamente no
primeiro livro, capitulos globais 0-72. Sao 54 trechos cartograficos;
nao sao 54 viagens literarias independentes nem 54 caminhos exatos.
Os trechos de um roteiro sao continuos geometricamente, mas nao implicam
que todos os desvios, acampamentos ou deslocamentos locais estejam resolvidos.

Os mapas-base, Viagens, O Ocidente e O Oriente servem para a geografia e
correspondencia das localidades. A narrativa LeYa e a planilha congelada
informam cenas e sequencia. Nao sao intercambiaveis: uma estrada desenhada
ou nome impresso nao certifica que um personagem passou por cada vertice.

As curvas continuam aproximadas. Pontos intermedios de linha NAO sao
posicoes atuais, paradas atestadas, coordenadas oficiais ou datas de viagem.
O capitulo de exibicao e um limite de spoilers, nao uma data de chegada.

## Revisao por personagem

| Personagem | Trechos | Revisao |
| --- | ---: | --- |
| Jon | 2 | Estrada do Rei ate a Muralha; partida e regresso no capitulo 70 com extensao esquematica. Bosque dos votos e patrulhas sem destino calibrado permanecem omitidos. |
| Tyrion | 10 | Comitiva, Muralha, retorno por Winterfell, captura no Entroncamento, montanhas da Lua, Ninho da Aguia, regresso, Ramo Verde e retorno a estalagem. |
| Robb | 4 | Fosso Cailin, Gargalo, As Gemeas, corredor de Feirajusta/Bosque dos Murmurios e Correrrio. |
| Catelyn | 10 | Porto Branco/Porto Real por mar, Estrada do Rei, Vale, retorno maritimo ao Norte e campanha de Robb. |
| Eddard | 3 | Estrada do Rei, Gargalo, Tridente e Porto Real. Desvio local de Darry nao medido. |
| Arya | 3 | Comitiva pela Estrada do Rei ate Porto Real, sem incorporar viagens do segundo livro. |
| Sansa | 3 | Comitiva pela Estrada do Rei ate Porto Real. |
| Bran | 0 | Posicoes conhecidas em Winterfell. Nao foi inventado um ponto para a execucao nos arredores do castelo. |
| Theon | 4 | Campanha com Robb no primeiro livro, sem antecipar a ida as Ilhas de Ferro do segundo. |
| Daenerys | 3 | Pentos, colinas de Norvos, floresta de Qohor, Mar Dothraki, Vaes Dothrak e corredor regional de Lhazar. |
| Jaime | 8 | Comitiva real, retorno, Estrada do Ouro, hoste ocidental, cerco, Bosque dos Murmurios e custodia em Correrrio. |
| Cersei | 4 | Ida e volta da comitiva entre Porto Real e Winterfell. |

Feirajusta e um corredor de Viagens/portal, nao uma parada confirmada por
uma frase do livro nesta revisao. O bosque e o campo do Ramo Verde sao
regioes aproximadas, nao novos assentamentos.

Em Essos, o livro descreve as colinas de Norvos e a floresta de Qohor;
a linha nao certifica visitas aos centros dessas cidades. Nao foi
reutilizado o desvio antigo por Ny Sar/Ar Noy como se fosse prova literaria.
O final em Lhazar e regional: a aldeia atacada e o acampamento nao foram
identificados como Hesh, Kosrak ou Lhazosh. A linha nao prossegue pelo
Deserto Vermelho/Qarth, acontecimentos dos livros seguintes.

Na volta de Catelyn, o desembarque em Porto Branco e atestado em Catelyn
VIII, capitulo global 55. O corredor via Vila Gaivota e referencia
cartografica/portal; nao e apresentado como cena detalhada de embarque.

## Correcoes de cronologia

- Tyrion: a posicao em Castelo Negro terminava no 27; agora termina no
  23. Bran IV (24) o coloca em Winterfell. Uma posicao atestada, nao
  interpolada, cobre 24-27. O Entroncamento e restaurado em 28-30,
  56-61 e 69-72, conforme os registros e cenas correspondentes.
- O trecho do Ramo Verde de Tyrion estava associado ao 56. O 56 mostra
  o encontro no Entroncamento; a marcha e batalha ficam no 62.
- Jaime: a linha parcial iniciada no 39 e substituida pelo corredor
  rumo ao Rochedo Casterly revelado no 40; o cerco de Correrrio e
  exibido no 59, em vez de antecipado pelo registro antigo do 55.

Localizadores EPUB: `OEBPS/Text/9788580442786_a_guerra_dos_tronos-N.html`,
onde N = capitulo global + 3 nesta edicao. Foram lidos os contextos
pertinentes da edicao AGOT-LEYA; isso nao e certificacao Suma nem auditoria
integral de todos os livros. Nenhum trecho integral foi publicado.

## Proveniencia e preservacao

- Entrada imutavel: `atlas-inventario-v3-pre-percursos-v1.json`,
  SHA256 `605192a25ce5c49864ddc16a6e6ebcefe4c4789b9042067285acc3571540186f`.
- Publicacao revisada:
  `0a982e04f7a3ffd7a0d3923a059b5002f847bd131267b948a590d302d7718ef5`.
- Livro consultado: AGOT-LEYA, ISBN 9788580442786; hash conferido:
  `72be668d777e87d1d2704c0ebf3cc07ea15e6e4c0301af53baa47f6f76e17e68`.
- Todos os 182 pontos fisicos, nomes, regioes e capitulos foram preservados.
  A auditoria antiga de 115 nomes nao foi ampliada nem usada para
  certificar estas rotas.
- Todos os registros originais continuam contabilizados exatamente uma
  vez entre linhas, posicoes e omissoes. Complementos narrativos usam
  `sourceRecordIndex: null` e `derivedSourceRecordIndices`, sendo contados
  separadamente. Posicoes novas sao cenas em localidades conhecidas,
  nunca interpolacao sobre uma linha.
- Transformacao e residuos antigos ficam em `historicalCalibration`;
  nenhuma linha atual depende do ajuste afim.
- Originais, JPEGs mestres, tiles e portal principal nao foram alterados.

Build reproduzivel, sem processamento dos livros ou imagens:

```powershell
.\.venv-book-audit\Scripts\python.exe .\atlas\scripts\revisar-percursos-v1.py
# Candidato e diagnostico. Publicacao deliberada:
.\.venv-book-audit\Scripts\python.exe .\atlas\scripts\revisar-percursos-v1.py --publish
```

Validacao dos dados: 7 testes de percursos e 8 de inventario aprovados
apos a conferencia final do extremo regional em Lhazar, ao sul do rio.
Evidencia em `atlas/test/evidencias/rotas-v1-dados-testes-final.txt`.
Os 6 testes de nomes passaram no gate anterior e nao foram afetados pela
revisao das linhas (`atlas/test/evidencias/rotas-v1-dados-testes.txt`).
Esses testes verificam consistencia, proveniencia e limites de spoilers,
nao transformam corredores aproximados em caminhos exatos.

## Interface validada

Roteiro clicavel por trecho, isolamento de personagem, linhas com contorno
e fontes recolhidas no popup. "Ver percurso" revela as linhas sem mudar o
capitulo; a opcao de livro completo exige acao explicita. Popups de trecho
fecham ao ocultar a rota ou trocar o sistema de coordenadas preview/nativo.

Gate de navegador: inventario 81/81, fixtures 45/45, validador 38/38,
projecao nativa de Catelyn 4/4. Apos os ajustes de ciclo de vida do popup,
suite focada de rotas 66/66 com o artefato publicado final. Conferencia
visual aprovada em `rotas-nativo.png`; servidor mantido em localhost:8080.
O autoPan continua sujeito aos limites fisicos de navegacao do mapa.
