/* Atlas piloto local — visor Leaflet CRS.Simple.
   Sem manifesto, exibe a previa reduzida upright como imageOverlay.
   data/mapa.json validado ativa a camada de tiles nativos. */
(function () {
  "use strict";

  var OVERVIEW_URL = "assets/o-mundo-conhecido-recorte-v1-preview.webp";
  var MANIFEST_URL = "data/mapa.json";

  var mapEl = document.getElementById("mapa");
  var statusEl = document.getElementById("mapa-status");
  var erroEl = document.getElementById("mapa-erro");
  var avisoTextoEl = document.getElementById("aviso-texto");
  var badgeEstadoEl = document.getElementById("badge-estado");
  var btnTelaCheia = document.getElementById("btn-tela-cheia");
  var btnAjuda = document.getElementById("btn-ajuda");
  var btnTiles = document.getElementById("btn-tiles");
  var painelAjuda = document.getElementById("painel-ajuda");
  var lateralEl = document.getElementById("lateral");
  var lateralCorpo = document.getElementById("lateral-corpo");
  var btnPainel = document.getElementById("btn-painel");

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  var map = L.map("mapa", {
    crs: L.CRS.Simple,
    minZoom: -8,
    maxZoom: 4,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    zoomControl: true,
    attributionControl: false
  });

  var homeBounds = null;
  var tilesLayer = null;
  var overlayLayer = null;
  var carregandoTiles = false;

  /* o painel flutuante nao pode arrastar/dar zoom no mapa por baixo */
  if (lateralEl) {
    L.DomEvent.disableClickPropagation(lateralEl);
    L.DomEvent.disableScrollPropagation(lateralEl);
  }

  /* abre/recolhe o painel flutuante; no mobile inicia recolhido */
  function definirPainel(aberto) {
    lateralCorpo.hidden = !aberto;
    lateralEl.classList.toggle("lateral-fechada", !aberto);
    btnPainel.setAttribute("aria-expanded", aberto ? "true" : "false");
    btnPainel.textContent = aberto ? "Recolher painel" : "Abrir painel";
    /* nao recentraliza: apenas avisa o Leaflet do novo espaco util */
    map.invalidateSize({ pan: false });
  }
  btnPainel.addEventListener("click", function () {
    definirPainel(lateralCorpo.hidden);
  });
  if (window.matchMedia &&
      window.matchMedia("(max-width: 700px)").matches) {
    definirPainel(false);
  }

  if (window.GOTATLAS) {
    window.GOTATLAS.init({ map: map });
  }
  /* gancho de depuracao/teste */
  window.__atlasMap = map;

  /* ---------- previa reduzida ---------- */

  setStatus("Carregando pr\u00e9via reduzida\u2026");

  var probe = new Image();
  probe.onload = function () {
    /* um onload tardio nao pode sobrescrever o modo nativo ja ativo */
    if (tilesLayer) return;
    var w = probe.naturalWidth;
    var h = probe.naturalHeight;
    var bounds = L.latLngBounds([[0, 0], [h, w]]);

    overlayLayer = L.imageOverlay(probe.src, bounds).addTo(map);
    map.setMaxBounds(bounds);
    /* cobertura (inside=true): a imagem preenche o quadro; o usuario
       afasta/arrasta para ver a imagem inteira */
    map.setView(bounds.getCenter(),
      map.getBoundsZoom(bounds, true), { animate: false });
    homeBounds = bounds;
    setStatus("");
    if (window.GOTATLAS) {
      window.GOTATLAS.setView({
        mode: "preview",
        naturalW: w,
        naturalH: h
      });
    }
  };
  probe.onerror = function () {
    setStatus("");
    erroEl.hidden = false;
  };
  probe.src = OVERVIEW_URL;

  /* ---------- controles ---------- */

  btnTelaCheia.addEventListener("click", function () {
    var saindo = document.fullscreenElement || document.webkitFullscreenElement;
    if (saindo) {
      var sair = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        if (sair) sair.call(document);
      } catch (e) {
        /* noop: sair da tela cheia nao deve falhar */
      }
      return;
    }
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) {
      setStatus("Tela cheia n\u00e3o suportada neste navegador.");
      return;
    }
    var promessa;
    try {
      /* webkitRequestFullscreen retorna void; resolve() normaliza */
      promessa = Promise.resolve(req.call(el));
    } catch (e) {
      setStatus("Tela cheia n\u00e3o suportada neste navegador.");
      return;
    }
    promessa.then(function () {
      setStatus("Tela cheia ativa; pressione Esc para sair.");
      setTimeout(function () { map.invalidateSize(); }, 120);
    }).catch(function () {
      setStatus("O navegador recusou o modo de tela cheia.");
    });
  });

  function aoMudarFullscreen() {
    map.invalidateSize();
  }
  document.addEventListener("fullscreenchange", aoMudarFullscreen);
  document.addEventListener("webkitfullscreenchange", aoMudarFullscreen);

  btnAjuda.addEventListener("click", function () {
    var abrir = painelAjuda.hidden;
    painelAjuda.hidden = !abrir;
    btnAjuda.setAttribute("aria-expanded", abrir ? "true" : "false");
    btnAjuda.textContent = abrir ? "Ocultar ajuda" : "Ajuda";
  });

  /* ---------- tiles nativos (manifesto, acao manual com retentativa) ---------- */

  btnTiles.addEventListener("click", function () {
    if (tilesLayer) {
      setStatus("Tiles nativos j\u00e1 est\u00e3o carregados.");
      return;
    }
    if (carregandoTiles) {
      return;
    }
    carregandoTiles = true;
    btnTiles.disabled = true;
    setStatus("Procurando manifesto de tiles\u2026");
    fetch(MANIFEST_URL)
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error("manifesto ausente (HTTP " + resp.status + ")");
        }
        return resp.json();
      })
      .then(function (m) {
        if (!m.nativePixelsValidated) {
          setStatus("Manifesto encontrado, mas pixels nativos ainda n\u00e3o " +
            "validados. Mantida a pr\u00e9via.");
          return;
        }
        var bounds = L.latLngBounds(
          map.unproject([0, 0], m.maxNativeZoom),
          map.unproject([m.width, m.height], m.maxNativeZoom)
        );
        /* preserva centro relativo a imagem e escala efetiva de pixels,
           em vez de reenquadrar o mapa inteiro */
        var centroAlvo = null;
        var zoomAlvo = null;
        if (overlayLayer && probe.naturalWidth && probe.naturalHeight) {
          var c0 = map.getCenter();
          var xImg = c0.lng * m.width / probe.naturalWidth;
          var yImg = (1 - c0.lat / probe.naturalHeight) * m.height;
          centroAlvo = map.unproject([xImg, yImg], m.maxNativeZoom);
          zoomAlvo = map.getZoom() +
            Math.log2(probe.naturalWidth * Math.pow(2, m.maxNativeZoom) / m.width);
        }
        var versao = m.sourceSha256 ? "?v=" + String(m.sourceSha256).slice(0, 12) : "";
        /* min/max zoom do manifesto ANTES do setView, para permitir
           alcancar o zoom nativo */
        map.setMinZoom(m.minZoom);
        map.setMaxZoom(m.maxZoom);
        tilesLayer = L.tileLayer(m.tileUrl + versao, {
          tileSize: m.tileSize,
          minZoom: m.minZoom,
          maxNativeZoom: m.maxNativeZoom,
          maxZoom: m.maxZoom,
          updateWhenIdle: true,
          keepBuffer: 1,
          noWrap: true,
          bounds: bounds
        }).addTo(map);
        if (overlayLayer) {
          overlayLayer.remove();
        }
        map.setMaxBounds(bounds);
        if (centroAlvo && zoomAlvo !== null) {
          zoomAlvo = Math.min(m.maxZoom, Math.max(m.minZoom, zoomAlvo));
          map.setView(centroAlvo, zoomAlvo);
        } else {
          /* sem previa pronta: mesma cobertura inicial */
          map.setView(bounds.getCenter(),
            map.getBoundsZoom(bounds, true), { animate: false });
        }
        homeBounds = bounds;
        badgeEstadoEl.textContent = "Resolu\u00e7\u00e3o nativa";
        avisoTextoEl.textContent = "Tiles locais em resolu\u00e7\u00e3o nativa. " +
          "Marca\u00e7\u00f5es e trajetos em revis\u00e3o.";
        mapEl.setAttribute("aria-label",
          "Mapa O Mundo Conhecido, resolu\u00e7\u00e3o nativa");
        setStatus("Tiles de resolu\u00e7\u00e3o nativa carregados.");
        if (window.GOTATLAS) {
          window.GOTATLAS.setView({ mode: "native", manifest: m });
        }
      })
      .catch(function () {
        setStatus("Tiles nativos ainda n\u00e3o gerados; mantida a pr\u00e9via " +
          "reduzida.");
      })
      .finally(function () {
        carregandoTiles = false;
        btnTiles.disabled = false;
      });
  });
})();
