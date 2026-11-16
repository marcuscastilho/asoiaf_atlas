# Percursos v6 — revisao por livro e personagem

Estado: publicada localmente; cobertura parcial, com limites descritos abaixo.

## Escopo

- Base preservada: `atlas-inventario-v5.json`, SHA-256
  `e100756cbc9be874128db96ef6af540e8f6720312ff45df4086774e29e4d8999`.
- 240 localidades e suas identidades, coordenadas, filtros e aliases inalterados.
- 27 perfis, cinco livros e 344 capitulos em ordem de publicacao.
- 133 trechos, antes 115: 113 mantidos, dois substituidos e 20 novos registros.
- 157 referencias de posicao, antes 152; cinco novas referencias limitadas a uma cena.
- Uma correcao adicional: retorno de Mindinho a Porto Real liberado em 138, nao 135.
- Matriz com 135 combinacoes livro/personagem em `percursos-v6-diagnostico.json`.
  Sao registros inventariados, nao 135 releituras literarias integrais.

O indice LeYa usa capitulos e ancoras reais dos EPUBs, incluindo arquivos com
mais de um capitulo. Numeros de arquivos HTML nao sao usados como numeros de
capitulos. O indice e as evidencias anteriores sao preservados; esta rodada
acrescenta contextos selecionados, nao certifica todos os dados antigos.

## Acrescimos

- Jon e Sam: passagem por Brancarbor, substituindo a antiga ligacao direta
  entre Castelo Negro e a Fortaleza de Craster.
- Asha: viagem maritima ao norte de Bosque Profundo e visita a Winterfell.
- Victarion: mar, Rio Febre e marcha final para Fosso Cailin; depois,
  navegacao ao redor de Valiria e pelo estreito de Yaros, ainda sem chegada
  afirmada a Meereen.
- Arya: margem ocidental do Olho de Deus, fuga de Harrenhal para a Estalagem
  do Ajoelhado e deslocamento do Entroncamento ate Salinas.
- Mindinho: missao diplomatico-matrimonial em direcao a Ponteamarga e
  regresso, liberados retrospectivamente depois de sua reapresentacao.
- Theon: Forte do Pavor, Fosso Cailin, Vila Acidentada e Winterfell.
- Jovem Griff: baixo Roine, travessia para a regiao de Matabruma e
  aproximacao terrestre ao Poleiro do Grifo.
- Tyrion: Volantis, Golfo da Magoa e aproximacao da foz do Skahazadhan.
  O leilao e os acampamentos ficam fora de Meereen; nenhum pino de
  presenca dentro da cidade foi acrescentado.
- Arianne: referencia de Lancassolar em seu encontro com Arys.
  A viagem planejada pelo Vaith nao foi desenhada como se tivesse ocorrido.

As ordens de ataque em 97 e as previsoes em 119 nao sao tratadas como
conquistas ja realizadas. As linhas do ataque ao Norte aparecem somente
com a referencia posterior em 123. Em Brancarbor, a coluna volta a marchar
na propria cena: os pinos novos nao permanecem artificialmente ate 95.

## Significado Da Cobertura

Cada perfil tem uma entrada por livro:

- `partial-route`: existem trechos liberados nesse livro, ainda parciais.
- `positions-only`: existem referencias de localidade disponiveis, inclusive
  ultima referencia herdada de outro livro; nao ha um percurso desse livro
  revisado por completo.
- `no-reviewed-records`: nao ha registros cartograficos nesse intervalo.
  Isso nao demonstra ausencia de deslocamento na narrativa.

`segmentsStartingInBook` conta registros de trechos cujo inicio de
disponibilidade pertence ao livro. `positionReferencesInBook` conta
intervalos de referencia que intersectam o livro. Nenhum desses valores e
percentual de cobertura literaria. `reviewedChapters` agrega referencias de
cena congeladas e as conferencias selecionadas desta rodada.

Os avisos na interface acompanham o livro escolhido. Nao exibem os
destinos futuros, contagens futuras ou um selo de itinerario completo.
Percursos de livros anteriores continuam acumulados pelo controle de
capitulos, sem transformar AFFC e ADWD numa cronologia sincronizada.

## Limites Preservados

As linhas representam corredores cartograficos aproximados. As curvas de
rios e costas foram revistas sobre os tiles nativos, mas isso nao certifica
trilhas exatas, correntes, praias, pontes, vaus ou datas oficiais de chegada.
Trechos maritimos podem comecar ao largo de uma localidade quando o porto
ou a ligacao entre o simbolo impresso e o canal nao esta localizado com
seguranca. Nao se desenha uma linha automatica atravessando essa lacuna.

O desembarque da Companhia Dourada e a ligacao terrestre em Matabruma
permanecem separados por uma lacuna explicita. O ponto de desembarque nao
e apresentado como uma praia identificada. Regioes de calmaria e
aproximacao naval nao sao coordenadas exatas de embarcacoes.

Continuam incompletos, entre outros, os caminhos alem da Muralha, Oxcross,
Darry, Corvarbor, esconderijos da Irmandade, Pedramarela e varias etapas
nas Ilhas de Ferro. O diagnostico registra os limites por perfil.
Descricao geografica nao foi promovida a nome proprio; esta rodada nao
faz novo censo exaustivo dos simbolos.

A planilha colaborativa continua como referencia historica congelada,
nao foi reauditada integralmente. Suas datas estimadas nao sao oficiais.
O sidecar de nomes preserva os mesmos 115 registros historicos; a revisao
dos percursos nao amplia a certificacao de traducoes.

## Reproducao E Protecao

- `preparar-percursos-v6.py`: autor dos suplementos e da matriz; exige o
  SHA-256 da v5 e grava somente arquivos candidatos.
- `percursos-v6-cenarios.json`: contextos selecionados e geometria manual.
- `verificar-percursos-v6.py`: preservacao da v5, limites de cenas,
  localizadores, modos, lacunas, matriz e exclusoes narrativas.
- `render-percursos-v6.py`: renderiza uma candidata com SHA-256 fixado sobre
  os tiles existentes para inspecao visual.
- `verificar-cobertura-v6.mjs`: fixture sintetico da interface de cobertura.
- `verificar-percursos-v6.mjs`: gate da versao real e dos fallbacks.

A cascata e v6 -> v5 -> v4 -> v3 -> v2 -> v1, somente em HTTP 404.
Arquivo presente mas invalido, inclusive falha de cobertura, nao permite
downgrade silencioso. O portal em `/`, os mapas mestres e as versoes
congeladas v4/v5 permanecem preservados.

## Verificacoes Finais

- Versao publicada: 134 verificacoes de percursos/interface, todas aprovadas.
- Compatibilidade: 60 verificacoes de nomes v5 e 34 de livros v4, todas aprovadas.
- Dados legados: 27 testes Python, todos aprovados.
- Conferencia de dominio publicada: `test/evidencias/lead-verificacao-percursos-v6.json`, resultado `pass`.
- Logs: `test/evidencias/gate-v6-{percursos-v6,nomes-v5,livros-v4,python}.txt`.
- Captura complementar: `test/evidencias/percursos-v6-tyrion318-foz-popup.png`.

Esses testes verificam os registros disponiveis e a interface. Nao equivalem
a uma auditoria integral de todos os deslocamentos dos 27 personagens.
