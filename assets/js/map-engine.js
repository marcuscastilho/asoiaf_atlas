// Engine abstraction over Leaflet (default, no API key) and Google Maps
// (optional, when config.js provides the user's own key).
// Common interface: panTo, getCenter, getZoom, setZoom, onClick, onMove,
// setBaseLayer,
// onBaseLayerChange, marker, polyline, polygon, arrow, label, popup, project.
// All overlays expose .kind ('marker'|'line'|'arrow'|'polygon'|'label'),
// .position ([lat,lng] when applicable) and setVisible(bool).
window.GOTMAP = window.GOTMAP || {};

(function () {
  'use strict';
  var CORE = window.GOTCORE;

  var MIN_ZOOM = 1;
  var MAX_ZOOM = 5;

  // ---------- shared label DOM renderer ----------
  // Used by the Leaflet applyLabelStyle and the Google applyStyle_ so both
  // engines render identically: safe textContent, white outline stroke,
  // centering + bounded offsets, optional SVG textPath curve and a subtle
  // non-interactive leader back to the source anchor.
  var labelSeq = 0;
  var labelMeasureCtx = null;
  function measureLabelPx(text, fontPx) {
    if (!labelMeasureCtx) {
      labelMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    labelMeasureCtx.font =
      'italic ' + fontPx + 'px Georgia,\'Times New Roman\',serif';
    return labelMeasureCtx.measureText(text).width;
  }

  function renderLeader(el, leader) {
    var old = el.querySelector('svg.gotmap-leader');
    if (!leader) {
      if (old) old.parentNode.removeChild(old);
      el._leaderKey = null;
      return;
    }
    var dx = leader.dx, dy = leader.dy;
    var lkey = dx + ',' + dy;
    if (old && el._leaderKey === lkey) return; // same leader: keep the node
    if (old) old.parentNode.removeChild(old);
    el._leaderKey = lkey;
    var x = Math.min(0, dx), y = Math.min(0, dy);
    var w = Math.max(1, Math.abs(dx)), h = Math.max(1, Math.abs(dy));
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gotmap-leader');
    svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.position = 'absolute';
    svg.style.left = x + 'px';
    svg.style.top = y + 'px';
    svg.style.pointerEvents = 'none';
    var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', '0'); ln.setAttribute('y1', '0');
    ln.setAttribute('x2', String(dx)); ln.setAttribute('y2', String(dy));
    ln.setAttribute('stroke', 'rgba(0,0,0,.55)');
    ln.setAttribute('stroke-width', '0.6');
    svg.appendChild(ln);
    el.insertBefore(svg, el.firstChild);
  }

  function renderCurved(span, text, st) {
    var fs = st.fontSize || 12;
    var w = Math.max(24, measureLabelPx(text, fs));
    // gentle arch: magnitude capped, sign carried by st.curve
    var s = (st.curve > 0 ? 1 : -1) * Math.min(14, w * 0.09);
    // memoize on content inputs: pan/zoom style re-application must not
    // destroy+rebuild identical SVG (keeps the pathId stable too)
    var key = text + '|' + fs + '|' + s + '|' + (st.strokeWidth || 0);
    if (span._curveKey === key && span.querySelector('svg.gotmap-curve')) return;
    span._curveKey = key;
    var top = -Math.abs(s) - fs * 0.85;
    var height = fs * 1.25 + Math.abs(s);
    var pathId = 'lblcurve-' + (++labelSeq);
    var old = span.querySelector('svg.gotmap-curve');
    if (old) old.parentNode.removeChild(old);
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'gotmap-curve');
    svg.setAttribute('viewBox', '0 ' + top.toFixed(1) + ' ' + w.toFixed(1) + ' ' + height.toFixed(1));
    svg.setAttribute('width', w.toFixed(1));
    svg.setAttribute('height', height.toFixed(1));
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('id', pathId);
    path.setAttribute('d', 'M 0 0 Q ' + (w / 2).toFixed(1) + ' ' + (-2 * s).toFixed(1) + ' ' + w.toFixed(1) + ' 0');
    path.setAttribute('fill', 'none');
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('fill', 'currentColor');
    if (st.strokeWidth != null) {
      t.setAttribute('stroke', '#fff');
      t.setAttribute('stroke-width', st.strokeWidth.toFixed(2));
      t.setAttribute('paint-order', 'stroke');
    }
    var tp = document.createElementNS(NS, 'textPath');
    tp.setAttribute('href', '#' + pathId);
    tp.setAttribute('startOffset', '50%');
    tp.setAttribute('text-anchor', 'middle');
    tp.textContent = text; // DOM-safe text insertion
    t.appendChild(tp);
    svg.appendChild(path);
    svg.appendChild(t);
    span.textContent = '';
    span.appendChild(svg);
  }

  function applySharedLabel(el, text, st, centered) {
    var span = el.querySelector('.gotmap-label');
    if (!span) return;
    // whole-label memoization: identical style+content on the same icon
    // element must not rewrite styles/DOM (pan/zoom re-applies constantly)
    var skey = [text, st.fontSize, st.strokeWidth, st.kind, st.angle,
      st.offsetX || 0, st.offsetY || 0, st.curve || 0, centered ? 1 : 0,
      st.overlap ? 1 : 0,
      st.leader ? st.leader.dx + ',' + st.leader.dy : ''].join('|');
    if (el._stateKey === skey) return;
    el._stateKey = skey;
    var angle = st.angle || 0;
    if (st.curve) {
      renderCurved(span, text, st);
    } else {
      var svg = span.querySelector('svg.gotmap-curve');
      if (svg) svg.parentNode.removeChild(svg);
      span._curveKey = null;
      if (span.textContent !== text) span.textContent = text;
    }
    if (st.fontSize != null) {
      span.style.fontSize = st.fontSize + 'px';
      span.style.lineHeight = (st.fontSize * 1.1).toFixed(2) + 'px';
    }
    if (st.strokeWidth != null) {
      span.style.webkitTextStroke = st.strokeWidth + 'px #fff';
      span.style.paintOrder = 'stroke';
    }
    if (st.kind) el.classList.add('kind-' + st.kind);
    var tf = (centered ? 'translate(-50%, -50%) ' : '') +
      ((st.offsetX || st.offsetY)
        ? 'translate(' + (st.offsetX || 0) + 'px, ' + (st.offsetY || 0) + 'px) ' : '') +
      (angle ? 'rotate(' + angle + 'deg)' : '');
    span.style.transform = tf || '';
    if (st.overlap != null) el.setAttribute('data-overlap', st.overlap ? '1' : '0');
    renderLeader(el, st.leader);
  }

  // ---------- Leaflet implementation ----------
  function createLeafletEngine(el, opts) {
    if (!window.L) throw new Error('Leaflet não carregado');
    var L = window.L;
    // clear the "map did not load" fallback text and any previous engine DOM
    // (Leaflet does not remove existing children on init).
    el.innerHTML = '';
    var map = L.map(el, {
      center: opts.center,
      zoom: opts.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: 1,
      zoomDelta: 1,
      worldCopyJump: false,
      maxBounds: [[-85.05, -190], [85.05, 190]],
      maxBoundsViscosity: 1.0,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      'Mapa © <a href="https://www.sermountaingoat.co.uk/map/" target="_blank">theMountainGoat</a> (CC não-comercial)'
    );

    // TileLayer subclass via getTileUrl assignment (keyhole tile names)
    function makeLayer(layer) {
      var tl = L.tileLayer('', { noWrap: true, bounds: [[-85.05, -180], [85.05, 180]], tileSize: 256, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
      tl.getTileUrl = function (coords) {
        return CORE.tileUrl(layer, coords.x, coords.y, coords.z) ||
          'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      };
      return tl;
    }

    var layers = {
      pt: makeLayer('nat'),   // nat tiles + vector pt labels handled by app
      nat: makeLayer('nat'),
      fsm: makeLayer('fsm'),
    };
    var currentLayer = 'pt';
    layers.pt.addTo(map);

    // --- layer switcher control (styled like the original map-type buttons) ---
    var controlDiv = L.DomUtil.create('div', 'leaflet-control gotmap-layer-control');
    var btnRefs = {};
    ['pt', 'nat', 'fsm'].forEach(function (id) {
      var b = L.DomUtil.create('button', 'gotmap-layer-btn', controlDiv);
      b.type = 'button';
      b.textContent = GOTMAP.i18n.ui.layers[id];
      b.setAttribute('data-layer', id);
      btnRefs[id] = b;
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', function () { engine.setBaseLayer(id); });
    });
    var fsBtn = L.DomUtil.create('button', 'gotmap-layer-btn gotmap-fs-btn', controlDiv);
    fsBtn.type = 'button';
    fsBtn.textContent = '⛶';
    fsBtn.title = GOTMAP.i18n.ui.fullscreen;
    L.DomEvent.disableClickPropagation(fsBtn);
    L.DomEvent.on(fsBtn, 'click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    var LayerControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () { return controlDiv; },
    });
    map.addControl(new LayerControl());
    function syncButtons() {
      for (var id in btnRefs) {
        btnRefs[id].classList.toggle('gotmap-layer-active', id === currentLayer);
      }
    }
    syncButtons();

    var SYM_BOUNDS = [[-85.0511287798066, -180], [85.0511287798066, 180]];

    // --- source-resolution terrain: one original-quality image (roads/
    // wall/non-canon pre-composited by tools/build-terrain.py) above the nat
    // tiles, below the symbols; hidden on fsm which carries the artwork.
    map.createPane('source-terrain');
    var terrainPane = map.getPane('source-terrain');
    terrainPane.style.zIndex = 210;
    terrainPane.style.pointerEvents = 'none';
    var sourceTerrain = L.imageOverlay('assets/img/map-layers/terrain.jpg',
      SYM_BOUNDS, { pane: 'source-terrain', interactive: false });

    // --- source artwork symbols: the shipped nat tiles carry no
    // city/castle glyphs, so the original locations.png/spec_locations.png
    // layers are restored as non-interactive overlays (labels stay ours).
    // Hidden on fsm, whose tiles already draw the symbols.
    map.createPane('source-symbols');
    var symPane = map.getPane('source-symbols');
    symPane.style.zIndex = 250;
    symPane.style.pointerEvents = 'none';
    var sourceSymbols = [
      L.imageOverlay('assets/img/map-layers/locations.png', SYM_BOUNDS,
        { pane: 'source-symbols', interactive: false }),
      L.imageOverlay('assets/img/map-layers/spec_locations.png', SYM_BOUNDS,
        { pane: 'source-symbols', interactive: false }),
    ];
    function syncSourceSymbols(id) {
      var on = id !== 'fsm';
      if (on) { if (!map.hasLayer(sourceTerrain)) sourceTerrain.addTo(map); }
      else if (map.hasLayer(sourceTerrain)) map.removeLayer(sourceTerrain);
      sourceSymbols.forEach(function (o) {
        if (on) { if (!map.hasLayer(o)) o.addTo(map); }
        else if (map.hasLayer(o)) map.removeLayer(o);
      });
    }
    syncSourceSymbols(currentLayer);

    var moveHandlers = [];
    map.on('moveend zoomend viewreset resize', function () { moveHandlers.forEach(function (f) { f(); }); });
    var clickHandlers = [];
    map.on('click', function (e) {
      var ctrl = e.originalEvent && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
      clickHandlers.forEach(function (f) { f([e.latlng.lat, e.latlng.lng], { ctrl: ctrl }); });
    });
    var layerHandlers = [];

    function wrapOverlay(raw, kind, position) {
      var ov = {
        kind: kind,
        position: position,
        raw: raw,
        setVisible: function (v) {
          if (v) { if (!map.hasLayer(raw)) raw.addTo(map); }
          else if (map.hasLayer(raw)) map.removeLayer(raw);
        },
        getVisible: function () { return map.hasLayer(raw); },
      };
      return ov;
    }

    var engine = {
      kind: 'leaflet',
      map: map,
      panTo: function (latlng) { map.panTo(latlng); },
      getCenter: function () { var c = map.getCenter(); return [c.lat, c.lng]; },
      getZoom: function () { return map.getZoom(); },
      setZoom: function (z) { map.setZoom(z); },
      onClick: function (cb) { clickHandlers.push(cb); },
      onMove: function (cb) { moveHandlers.push(cb); },
      onBaseLayerChange: function (cb) { layerHandlers.push(cb); },
      getBaseLayer: function () { return currentLayer; },
      setBaseLayer: function (id) {
        if (!layers[id] || id === currentLayer) return;
        map.removeLayer(layers[currentLayer]);
        layers[id].addTo(map);
        currentLayer = id;
        syncButtons();
        syncSourceSymbols(id);
        layerHandlers.forEach(function (f) { f(id); });
      },
      marker: function (o) {
        var icon;
        if (o.icon && o.icon.divHtml != null) {
          icon = L.divIcon({
            className: o.icon.className || '',
            html: o.icon.divHtml,
            iconSize: o.icon.size || null,
            iconAnchor: o.icon.anchor || [0, 0],
          });
        } else {
          icon = L.icon({
            iconUrl: o.icon.url,
            iconSize: o.icon.size,
            iconAnchor: o.icon.anchor,
          });
        }
        var m = L.marker(o.position, {
          icon: icon,
          title: o.title || '',
          keyboard: false,
          interactive: o.interactive !== false,
        });
        if (o.onClick) m.on('click', function (e) { o.onClick(e); });
        if (o.visible) m.addTo(map);
        return wrapOverlay(m, 'marker', o.position);
      },
      polyline: function (o) {
        var p = L.polyline(o.path, {
          color: o.color,
          weight: o.weight || 8,
          opacity: o.opacity == null ? 1.0 : o.opacity,
          interactive: false,
        });
        if (o.visible) p.addTo(map);
        return wrapOverlay(p, 'line', null);
      },
      polygon: function (o) {
        var p = L.polygon(o.paths, {
          fillColor: o.fillColor,
          fillOpacity: o.fillOpacity == null ? 0.7 : o.fillOpacity,
          stroke: false,
          interactive: !!o.onClick,
        });
        if (o.onClick) p.on('click', function () { o.onClick(); });
        if (o.visible) p.addTo(map);
        return wrapOverlay(p, 'polygon', null);
      },
      arrow: function (position, heading, color, opacity) {
        var r = heading + 90;
        var dx = 30 * Math.cos(r * Math.PI / 180);
        var dy = 30 * Math.sin(r * Math.PI / 180);
        var id = 'arr' + Math.floor(Math.random() * 1e9);
        var html =
          '<svg width="120" height="120" stroke="' + color + '" fill="' + color +
          '" stroke-opacity="' + opacity + '" fill-opacity="' + opacity + '">' +
          '<marker id="' + id + '" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="12" markerHeight="9" orient="auto">' +
          '<path d="M 10 0 L 0 5 L 10 10 z"/></marker>' +
          '<line stroke-width="3" x1="60" y1="60" x2="' + (60 + dx) + '" y2="' + (60 + dy) +
          '" marker-start="url(#' + id + ')"/></svg>';
        var m = L.marker(position, {
          icon: L.divIcon({ className: 'gotmap-arrow', html: html, iconSize: [120, 120], iconAnchor: [60, 60] }),
          interactive: false,
          keyboard: false,
        });
        return wrapOverlay(m, 'arrow', position);
      },
      label: function (position, text, opts) {
        opts = opts || {};
        var interactive = !!(opts.url || opts.onClick);
        var stCentered = !!opts.centered;
        var m = L.marker(position, {
          icon: L.divIcon({
            className: 'gotmap-label-wrap ' + (opts.className || '') +
              (opts.kind ? ' kind-' + opts.kind : '') +
              (interactive ? ' clickable' : '') +
              (stCentered ? ' gotmap-centered' : ''),
            html: '<span class="gotmap-label"></span>',
            iconSize: null,
            iconAnchor: stCentered ? [0, 0] : [0, 7],
          }),
          interactive: interactive,
          keyboard: false,
        });
        if (interactive) {
          m.on('click', function (e) {
            var ev = e && e.originalEvent;
            if (ev && (ev.ctrlKey || ev.metaKey) && opts.onCtrlClick) { opts.onCtrlClick(); return; }
            if (opts.onClick) opts.onClick(ev);
            else if (opts.url) window.open(opts.url, '_blank', 'noopener');
          });
        }
        var ov = wrapOverlay(m, 'label', position);
        ov.text = text;
        var stAngle = opts.angle || 0;
        var lastStyle = {};
        function applyLabelStyle() {
          var el = m.getElement && m.getElement();
          if (!el) return;
          lastStyle.angle = stAngle;
          applySharedLabel(el, text, lastStyle, stCentered);
        }
        ov.setStyle = function (st) {
          for (var k in st) lastStyle[k] = st[k];
          if (st.angle != null) stAngle = st.angle;
          applyLabelStyle(); // lastStyle cached: re-add restores full style
        };
        var vis = false;
        var baseSetVisible = ov.setVisible;
        ov.setVisible = function (v) {
          v = !!v;
          if (v === vis) return; // no repeated add/remove work
          vis = v;
          baseSetVisible(v); // 'add' listener applies the cached style
        };
        m.on('add', applyLabelStyle); // fill text when the icon materializes
        return ov;
      },
      popup: function (position, html) {
        L.popup({ closeButton: true, autoPan: true, className: 'gotmap-popup' })
          .setLatLng(position)
          .setContent(html)
          .openOn(map);
      },
      project: function (latlng) {
        var p = map.latLngToContainerPoint(latlng);
        return { x: p.x, y: p.y };
      },
      getContainerSize: function () {
        var s = map.getSize();
        return { w: s.x, h: s.y };
      },
      invalidateSize: function () { map.invalidateSize(); },
      dispose: function () {
        map.remove(); // removes listeners + _leaflet_id
        el.innerHTML = '';
      },
    };
    return engine;
  }

  // ---------- Google Maps implementation ----------
  function createGoogleEngine(el, opts) {
    var g = window.google.maps;

    // --- text label overlay (custom OverlayView) ---
    function LabelOverlay(map, position, text, opts) {
      opts = opts || {};
      this.position_ = position;
      this.text_ = text;
      this.opts_ = opts;
      this.centered_ = !!opts.centered;
      this.style_ = {};
      this.angle_ = opts.angle || 0;
      this.setMap(map);
    }
    LabelOverlay.prototype = new g.OverlayView();
    LabelOverlay.prototype.onAdd = function () {
      var opts = this.opts_;
      this.div_ = document.createElement('div');
      this.div_.className = 'gotmap-label-wrap google ' + (opts.className || '') +
        (opts.kind ? ' kind-' + opts.kind : '') +
        ((opts.url || opts.onClick) ? ' clickable' : '') +
        (this.centered_ ? ' gotmap-centered' : '');
      var span = document.createElement('span');
      span.className = 'gotmap-label';
      span.textContent = this.text_; // DOM-safe text
      this.div_.appendChild(span);
      this.div_.style.position = 'absolute';
      this.div_.style.display = this.visible_ ? '' : 'none';
      if (opts.url || opts.onClick) {
        var self = this;
        this.div_.addEventListener('click', function (ev) {
          if (ev && (ev.ctrlKey || ev.metaKey) && opts.onCtrlClick) { opts.onCtrlClick(); return; }
          if (opts.onClick) opts.onClick(ev);
          else if (opts.url) window.open(opts.url, '_blank', 'noopener');
        });
      }
      this.getPanes().overlayImage.appendChild(this.div_);
      this.applyStyle_();
    };
    LabelOverlay.prototype.applyStyle_ = function () {
      if (!this.div_) return;
      this.style_.angle = this.angle_;
      applySharedLabel(this.div_, this.text_, this.style_, this.centered_);
    };
    LabelOverlay.prototype.setStyle = function (st) {
      for (var k in st) this.style_[k] = st[k];
      if (st.angle != null) this.angle_ = st.angle;
      this.applyStyle_();
    };
    LabelOverlay.prototype.draw = function () {
      var p = this.getProjection().fromLatLngToDivPixel(this.position_);
      if (this.div_) {
        // centered labels: span translates (-50%,-50%) so the anchor sits
        // exactly on the source label center - no offsetWidth math here.
        this.div_.style.left = p.x + 'px';
        this.div_.style.top = (this.centered_ ? p.y : p.y - 7) + 'px';
      }
    };
    LabelOverlay.prototype.onRemove = function () {
      if (this.div_ && this.div_.parentNode) this.div_.parentNode.removeChild(this.div_);
    };
    // remember desired visibility even when called before async onAdd
    LabelOverlay.prototype.setVisible = function (v) {
      v = !!v;
      if (v === this.visible_) return; // unchanged state: no DOM write
      this.visible_ = v;
      if (this.div_) this.div_.style.display = v ? '' : 'none';
    };

    // --- arrow overlay (SVG port of Bill Chadwick's v3arrows.js) ---
    var arrowCounter = 0;
    function ArrowOverlay(map, location, rotation, color, opacity) {
      this.location_ = location;
      var r = (rotation || 0) + 90;
      this.dx_ = 30 * Math.cos(r * Math.PI / 180);
      this.dy_ = 30 * Math.sin(r * Math.PI / 180);
      this.color_ = color || '#0000FF';
      this.opacity_ = opacity == null ? 1 : opacity;
      this.svgId_ = 'ArrowOverlay' + arrowCounter++;
      this.setMap(map);
    }
    ArrowOverlay.prototype = new g.OverlayView();
    ArrowOverlay.prototype.onAdd = function () {
      var div = document.createElement('div');
      var svgNS = 'http://www.w3.org/2000/svg';
      var svgRoot = document.createElementNS(svgNS, 'svg');
      svgRoot.setAttribute('width', 120);
      svgRoot.setAttribute('height', 120);
      svgRoot.setAttribute('stroke', this.color_);
      svgRoot.setAttribute('fill', this.color_);
      svgRoot.setAttribute('stroke-opacity', this.opacity_);
      svgRoot.setAttribute('fill-opacity', this.opacity_);
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('stroke-width', 3);
      line.setAttribute('x1', 60);
      line.setAttribute('y1', 60);
      line.setAttribute('x2', 60 + this.dx_);
      line.setAttribute('y2', 60 + this.dy_);
      var mk = document.createElementNS(svgNS, 'marker');
      mk.id = this.svgId_;
      mk.setAttribute('viewBox', '0 0 10 10');
      mk.setAttribute('refX', 0);
      mk.setAttribute('refY', 5);
      mk.setAttribute('markerWidth', 12);
      mk.setAttribute('markerHeight', 9);
      mk.setAttribute('orient', 'auto');
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M 10 0 L 0 5 L 10 10 z');
      mk.appendChild(path);
      svgRoot.appendChild(mk);
      svgRoot.appendChild(line);
      div.appendChild(svgRoot);
      this.svgRoot_ = svgRoot;
      this.div_ = div;
      this.div_.style.display = this.visible_ ? '' : 'none';
      this.getPanes().overlayImage.appendChild(div);
    };
    ArrowOverlay.prototype.draw = function () {
      var p = this.getProjection().fromLatLngToDivPixel(this.location_);
      if (p && this.svgRoot_) {
        this.svgRoot_.setAttribute('style', 'position:absolute; top:' + (p.y - 60) + 'px; left:' + (p.x - 60) + 'px');
      }
    };
    ArrowOverlay.prototype.onRemove = function () {
      if (this.div_ && this.div_.parentNode) this.div_.parentNode.removeChild(this.div_);
    };
    // remember desired visibility even when called before async onAdd
    ArrowOverlay.prototype.setVisible = function (v) {
      this.visible_ = v;
      if (this.div_) this.div_.style.display = v ? '' : 'none';
    };

    // projection helper for label collision
    function ProjectionOverlay() {}
    ProjectionOverlay.prototype = new g.OverlayView();
    ProjectionOverlay.prototype.onAdd = function () {};
    ProjectionOverlay.prototype.draw = function () {};
    ProjectionOverlay.prototype.onRemove = function () {};

    var center = new g.LatLng(opts.center[0], opts.center[1]);
    var layerIds = ['pt', 'nat', 'fsm'];
    var layerNames = {
      pt: GOTMAP.i18n.ui.layers.pt,
      nat: GOTMAP.i18n.ui.layers.nat,
      fsm: GOTMAP.i18n.ui.layers.fsm,
    };

    var map = new g.Map(el, {
      center: center,
      zoom: opts.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControlOptions: { mapTypeIds: layerIds },
      language: 'pt-BR',
    });

    function imageMapType(id, layer) {
      var mt = new g.ImageMapType({
        getTileUrl: function (coord, zoom) {
          if (CORE.isOutsideTileRange(coord.x, coord.y, zoom)) return null;
          return 'assets/tiles/' + layer + '/' + CORE.getTileCode(coord.x, coord.y, zoom) + '.jpg';
        },
        tileSize: new g.Size(256, 256),
        maxZoom: MAX_ZOOM,
        minZoom: MIN_ZOOM,
        radius: 1738000,
        name: layerNames[id],
      });
      return mt;
    }
    map.mapTypes.set('pt', imageMapType('pt', 'nat'));
    map.mapTypes.set('nat', imageMapType('nat', 'nat'));
    map.mapTypes.set('fsm', imageMapType('fsm', 'fsm'));
    map.setMapTypeId('pt');

    var projOverlay = new ProjectionOverlay();
    projOverlay.setMap(map);

    // --- source-resolution terrain + artwork symbols restored as
    // non-interactive ground overlays (terrain drawn first, below symbols);
    // hidden on fsm which already carries the original artwork.
    var srcSymBounds = {
      south: -85.0511287798066, north: 85.0511287798066,
      west: -180, east: 180,
    };
    var sourceSymbols = [
      new g.GroundOverlay('assets/img/map-layers/terrain.jpg',
        srcSymBounds, { clickable: false }),
      new g.GroundOverlay('assets/img/map-layers/locations.png',
        srcSymBounds, { clickable: false }),
      new g.GroundOverlay('assets/img/map-layers/spec_locations.png',
        srcSymBounds, { clickable: false }),
    ];
    function syncSourceSymbols() {
      var on = String(map.getMapTypeId()) !== 'fsm';
      sourceSymbols.forEach(function (o) { o.setMap(on ? map : null); });
    }
    syncSourceSymbols();

    var layerHandlers = [];
    g.event.addListener(map, 'maptypeid_changed', function () {
      syncSourceSymbols();
      layerHandlers.forEach(function (f) { f(map.getMapTypeId()); });
    });

    var clickHandlers = [];
    g.event.addListener(map, 'click', function (e) {
      var ctrl = e.domEvent && (e.domEvent.ctrlKey || e.domEvent.metaKey);
      clickHandlers.forEach(function (f) { f([e.latLng.lat(), e.latLng.lng()], { ctrl: ctrl }); });
    });
    var moveHandlers = [];
    g.event.addListener(map, 'idle', function () {
      moveHandlers.forEach(function (f) { f(); });
    });

    function toLatLng(p) { return new g.LatLng(p[0], p[1]); }
    function toLatLngArr(path) { return path.map(toLatLng); }

    var engine = {
      kind: 'google',
      map: map,
      panTo: function (latlng) { map.panTo(toLatLng(latlng)); },
      getCenter: function () { var c = map.getCenter(); return [c.lat(), c.lng()]; },
      getZoom: function () { return map.getZoom(); },
      setZoom: function (z) { map.setZoom(z); },
      onClick: function (cb) { clickHandlers.push(cb); },
      onMove: function (cb) { moveHandlers.push(cb); },
      onBaseLayerChange: function (cb) { layerHandlers.push(cb); },
      getBaseLayer: function () { return String(map.getMapTypeId()); },
      setBaseLayer: function (id) { map.setMapTypeId(id); },
      marker: function (o) {
        var icon = o.icon.url ? {
          url: o.icon.url,
          size: new g.Size(o.icon.size[0], o.icon.size[1]),
          scaledSize: new g.Size(o.icon.size[0], o.icon.size[1]),
          anchor: new g.Point(o.icon.anchor[0], o.icon.anchor[1]),
        } : undefined;
        var m = new g.Marker({
          position: toLatLng(o.position),
          title: o.title || '',
          icon: icon,
          visible: !!o.visible,
          map: map,
          clickable: o.interactive !== false,
        });
        if (o.onClick) g.event.addListener(m, 'click', function (e) { o.onClick(e); });
        return {
          kind: 'marker',
          position: o.position,
          raw: m,
          setVisible: function (v) { m.setVisible(v); },
          getVisible: function () { return m.getVisible(); },
        };
      },
      polyline: function (o) {
        var p = new g.Polyline({
          path: toLatLngArr(o.path),
          strokeColor: o.color,
          strokeOpacity: o.opacity == null ? 1.0 : o.opacity,
          strokeWeight: o.weight || 8,
          visible: !!o.visible,
          map: map,
          clickable: false,
        });
        return {
          kind: 'line',
          raw: p,
          setVisible: function (v) { p.setVisible(v); },
          getVisible: function () { return p.getVisible(); },
        };
      },
      polygon: function (o) {
        var p = new g.Polygon({
          paths: toLatLngArr(o.paths),
          fillColor: o.fillColor,
          fillOpacity: o.fillOpacity == null ? 0.7 : o.fillOpacity,
          strokeWeight: 0,
          visible: !!o.visible,
          map: map,
        });
        if (o.onClick) g.event.addListener(p, 'click', function () { o.onClick(); });
        return {
          kind: 'polygon',
          raw: p,
          setVisible: function (v) { p.setVisible(v); },
          getVisible: function () { return p.getVisible(); },
        };
      },
      arrow: function (position, heading, color, opacity) {
        var a = new ArrowOverlay(map, toLatLng(position), heading, color, opacity);
        return {
          kind: 'arrow',
          position: position,
          raw: a,
          setVisible: function (v) { a.setVisible(v); },
          getVisible: function () { return a.visible_ === true; },
        };
      },
      label: function (position, text, opts) {
        var l = new LabelOverlay(map, toLatLng(position), text, opts || {});
        return {
          kind: 'label',
          position: position,
          text: text,
          raw: l,
          setStyle: function (st) { l.setStyle(st); },
          setVisible: function (v) { l.setVisible(v); },
          getVisible: function () { return l.visible_ === true; },
        };
      },
      popup: function (position, html) {
        new g.InfoWindow({ content: html, position: toLatLng(position) }).open(map);
      },
      project: function (latlng) {
        var pr = projOverlay.getProjection();
        if (!pr) return null;
        var p = pr.fromLatLngToContainerPixel(toLatLng(latlng));
        return { x: p.x, y: p.y };
      },
      getContainerSize: function () {
        var d = el.getBoundingClientRect();
        return { w: d.width, h: d.height };
      },
      invalidateSize: function () { g.event.trigger(map, 'resize'); },
      dispose: function () {
        sourceSymbols.forEach(function (o) { o.setMap(null); });
        g.event.clearInstanceListeners(map);
        el.innerHTML = '';
      },
    };
    return engine;
  }

  GOTMAP.createLeafletEngine = createLeafletEngine;
  GOTMAP.createGoogleEngine = createGoogleEngine;
})();
