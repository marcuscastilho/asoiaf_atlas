// Verificacao mecanica do piloto /atlas/ — wrapper de compatibilidade.
// A suite canonica e ./verificar-tiles-auto.mjs: os tiles nativos sao
// carregados automaticamente no boot (sem botao "Carregar tiles") e ela
// cobre portal, desktop, mobile, ajuda, tela cheia, zoom, apoio de
// previa e todos os cenarios de falha que esta suite antiga cobria.
// Uso: node atlas/test/verificar.mjs   (servidor http-server na raiz, porta 8080)
import "./verificar-tiles-auto.mjs";
