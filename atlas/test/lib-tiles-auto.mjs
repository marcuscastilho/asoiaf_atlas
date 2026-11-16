// Helper SOMENTE DE TESTE: pausa o carregamento automatico dos tiles
// nativos para suites legadas que exercitam a transicao previa->nativo.
//
// GOTATLAS.init (overlays.js) busca data/mapa.json PRIMEIRO — esse
// pedido passa direto (route.fallback). O boot do atlas.js e o SEGUNDO
// pedido e fica retido ate liberarTilesAutomaticos(page), entao a
// pagina sobe em modo previa como antes. Mocks existentes de mapa.json
// continuam valendo porque usamos route.fallback(), nao fulfill.
//
// Registrar ANTES do page.goto. Suites novas (verificar-tiles-auto e
// gates atuais) NAO usam este helper.

const liberadores = new WeakMap();

export async function pausarTilesAutomaticos(page) {
  let liberar;
  const portao = new Promise((res) => { liberar = res; });
  let pedidos = 0;
  await page.route("**/atlas/data/mapa.json", async (route) => {
    pedidos++;
    if (pedidos === 1) {
      /* manifesto do painel (GOTATLAS.init) — nunca retido */
      return route.fallback();
    }
    await portao;
    return route.fallback();
  });
  liberadores.set(page, liberar);
}

export function liberarTilesAutomaticos(page) {
  const liberar = liberadores.get(page);
  if (liberar) {
    liberadores.delete(page);
    liberar();
  }
}
