// Application logic - pt-BR localized port of the original Quartermaester
// behavior (ASoIaF-objects.js + ASoIaF-events.js), engine-agnostic via
// assets/js/map-engine.js. Books-only runtime: chapter mode is the sole
// spoiler timeline (no TV episode data or controls). Original bugs fixed
// (see README):
//  - slider increment clamped before reading titles
//  - nobility refreshed on arrow increments
//  - marker-only mode hides lines AND arrows (original only hid lines)
//  - selecting a character with no current marker no longer pans to null
//  - Aegon stays hidden (and unselected) before chapter 289
//  - town popups pick the house visible in the CURRENT spoiler range instead
//    of the last nobility entry that overwrote the seat
/* global google, L */
$(function () {
  'use strict';
  var CORE = window.GOTCORE;
  var I18N = window.GOTI18N;
  window.GOTMAP = window.GOTMAP || {};
  GOTMAP.i18n = I18N;

  var engine = null;
  var regionOverlays = [];
  var nobilityOverlays = [];
  var pathOverlays = {}; // character -> [overlay]
  var townLabelOverlays = [];
  var geoLabelOverlays = [];
  var catalogLabelOverlays = []; // {ov,key,fontSize,text}
  var catalogKeys = {};          // location keys covered by the catalog
  var catalogById = {};          // catalog id -> first feature (hash targets)
  var seatHouses = {};   // seatKey -> [{name,img,ranges,isGreat}]
  var lastLayout = null; // last rebuildLabels pass (debug/testing)
  var ctrlPressed = false;

  // Source-aligned label catalog (assets/js/cartography.js, authored
  // separately). x/y are label centers on the original 4642x4642 artwork.
  var CATALOG = window.GOTMAP_CARTOGRAPHY || { width: 4642, height: 4642, features: [] };
  function catalogLatLng(f) {
    var lng = f.x / CATALOG.width * 360 - 180;
    var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * f.y / CATALOG.height))) * 180 / Math.PI;
    return [lat, lng];
  }
  function locUrl(key) {
    var loc = window.locations[key];
    return (loc && loc.url) || 'https://awoiaf.westeros.org/index.php/' + key;
  }
  // text interpolated into generated HTML (popups, search items)
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.onkeydown = function (e) { ctrlPressed = e.ctrlKey || e.metaKey; };
  document.onkeyup = function () { ctrlPressed = false; };

  // ---------- helpers ----------
  function checkLocKey(locationKey, lat, lng) {
    if (window.locations[locationKey]) {
      var loc = window.locations[locationKey];
      if (Math.abs(loc.lat) < 84.7 && Math.abs(loc.lng) <= 176) return [loc.lat, loc.lng];
    }
    if (typeof lat !== 'undefined' && typeof lng !== 'undefined') {
      if (Math.abs(lat) < 84.7 && Math.abs(lng) <= 176) return [lat, lng];
    }
    return false;
  }

  function displayName(key) {
    var loc = window.locations[key];
    if (I18N.towns[key]) return I18N.towns[key];
    if (loc && typeof loc.title === 'string') return loc.title.replace(/^\d+:\s*/, '');
    return CORE.decodeLocationKey(key);
  }

  function heraldryUrl(originalUrl, labelText) {
    // the Night's Watch flag is a plain relative filename in the original
    // data, not a downloadable URL - serve the local copy directly.
    if (originalUrl === 'black_flag.png' || /black_flag/.test(originalUrl)) {
      return 'assets/img/black_flag.png';
    }
    var entry = window.HERALDRY_MANIFEST && window.HERALDRY_MANIFEST[originalUrl];
    if (entry && entry.status === 'ok' && entry.file) return entry.file;
    return placeholderSigil(labelText || '?');
  }

  // neutral initials placeholder (SVG data URI) - never an invented sigil
  function placeholderSigil(text) {
    var initial = (
      String(text).replace(/^(House|Casa|Clan|Clã)\s+/, '')[0] || '?'
    ).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">' +
      '<rect width="60" height="60" fill="#c9c3b4" stroke="#7a6a55" stroke-width="2"/>' +
      '<text x="30" y="40" font-family="Georgia,serif" font-size="30" fill="#5a4a38" text-anchor="middle">' +
      initial + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // house icons next to character names: original CSS hotlinked awoiaf
  // (blocked by CORP). We point each class at the local heraldry file
  // (or the initials placeholder when the download failed).
  var ICON_URLS = {
    stark: 'https://awoiaf.westeros.org/images/thumb/5/51/House_Stark.PNG/50px-House_Stark.PNG',
    nightswatch: 'black_flag.png',
    targaryen: 'https://awoiaf.westeros.org/images/thumb/4/43/House_Targaryen.PNG/92px-House_Targaryen.PNG',
    lannister: 'https://awoiaf.westeros.org/images/thumb/8/88/House_Lannister.png/50px-House_Lannister.png',
    baratheon: 'https://awoiaf.westeros.org/images/thumb/d/d1/House_Baratheon.PNG/50px-House_Baratheon.PNG',
    baratheonokl: 'https://awoiaf.westeros.org/images/thumb/5/5d/Joffrey_sigil_coat.png/120px-Joffrey_sigil_coat.png',
    baratheonod: 'https://awoiaf.westeros.org/images/thumb/2/2e/Stannis_sigil_coat.png/60px-Stannis_sigil_coat.png',
    greyjoy: 'https://awoiaf.westeros.org/images/thumb/f/f3/Greyjoy_coat_sigil.png/120px-Greyjoy_coat_sigil.png',
    tarth: 'https://awoiaf.westeros.org/images/thumb/f/f3/House_Tarth.PNG/40px-House_Tarth.PNG',
    seaworth: 'https://awoiaf.westeros.org/images/thumb/9/99/Seaworth.png/90px-Seaworth.png',
    tarly: 'https://awoiaf.westeros.org/images/thumb/d/d8/Tarly.png/100px-Tarly.png',
    martell: 'https://awoiaf.westeros.org/images/thumb/b/ba/House_Martell.PNG/92px-House_Martell.PNG',
    baelish: 'https://awoiaf.westeros.org/images/thumb/6/69/Baelish%28Harrenhal%29CoA.png/50px-Baelish%28Harrenhal%29CoA.png',
    duncan: 'https://awoiaf.westeros.org/images/thumb/e/e4/Dunk.png/50px-Dunk.png',
  };
  function applyIconStyles() {
    var css = '';
    for (var cls in ICON_URLS) {
      css += '.icon.' + cls + '{background-image:url("' + heraldryUrl(ICON_URLS[cls], cls) + '");}\n';
    }
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  var pinCache = {};
  function pinIcon(iconStr) {
    if (pinCache[iconStr]) return pinCache[iconStr];
    var spec = CORE.parsePinSpec(iconStr);
    var url, size, anchor;
    if (spec.kind === 'skull') {
      url = 'assets/img/skull.png'; size = [16, 16]; anchor = [8, 16];
    } else if (spec.kind === 'lost') {
      url = 'assets/img/question-mark.svg'; size = [16, 16]; anchor = [8, 16];
    } else {
      var w = spec.side === 'left' ? 35 : spec.side === 'right' ? 24 : 24;
      var h = 34;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      var px = spec.side === 'left' ? 23 : 12; // pin center x in canvas
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      if (spec.side === 'left') { ctx.beginPath(); ctx.ellipse(10, 31, 9, 3, 0, 0, 7); ctx.fill(); }
      if (spec.side === 'right') { ctx.beginPath(); ctx.ellipse(15, 31, 9, 3, 0, 0, 7); ctx.fill(); }
      // teardrop
      ctx.fillStyle = spec.fill;
      ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath();
      ctx.moveTo(px, h - 2);
      ctx.lineTo(px - 8, 13);
      ctx.arc(px, 10, 8, Math.PI * 0.85, Math.PI * 0.15, false);
      ctx.lineTo(px, h - 2);
      ctx.fill(); ctx.stroke();
      // letter
      ctx.fillStyle = spec.textColor;
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.letter, px, 10);
      url = c.toDataURL('image/png');
      size = [w, h];
      anchor = spec.side === 'left' ? [23, 33] : spec.side === 'right' ? [0, 33] : [12, 33];
    }
    var icon = { url: url, size: size, anchor: anchor };
    pinCache[iconStr] = icon;
    return icon;
  }

  // Transparent hit target only - the source map artwork already draws
  // city/town/castle/ruin/other symbols in the base tiles, so we must NOT
  // overlay a generic marker on top of it. A 16px fully transparent GIF
  // keeps each original position clickable without hiding the art.
  var HIT_ICON = {
    url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    size: [16, 16],
    anchor: [8, 8],
  };
  function hitIcon() { return HIT_ICON; }

  // ---------- town popups ----------
  function currentHouseFor(key) {
    var list = seatHouses[key];
    if (!list || !list.length) return null;
    var idx = parseInt($('#chapSlider').val(), 10) || 0;
    for (var i = 0; i < list.length; i++) {
      if (CORE.inRange(list[i].ranges.chapters, idx)) return list[i];
    }
    return null;
  }

  function townPopupHtml(key) {
    var loc = window.locations[key];
    var pt = displayName(key);
    var en = CORE.decodeLocationKey(key);
    var url = (loc && loc.url) || ('https://awoiaf.westeros.org/index.php/' + key);
    var html = '';
    var house = currentHouseFor(key);
    if (house) {
      html += '<img class="popup-sigil" src="' + escHtml(house.img) + '" alt="">';
    }
    html += '<b>' + escHtml(pt) + '</b>';
    if (pt !== en) html += '<br><span class="popup-orig">' + I18N.ui.originalNameLabel + escHtml(en) + '</span>';
    if (house) html += '<br>' + I18N.ui.houseLabel + escHtml(house.name);
    html += '<br><a target="_blank" rel="noopener" href="' + escHtml(url) + '">' + I18N.ui.wikiLinkLabel + '</a>';
    return html;
  }

  function openTownPopup(key) {
    var coords = checkLocKey(key);
    if (!coords) return;
    engine.panTo(coords);
    engine.popup(coords, townPopupHtml(key));
  }

  // catalog-only feature: pan + short popup (search/hash path; the map
  // label itself still opens its external reference URL directly)
  function catalogPopupHtml(f) {
    var html = '<b>' + escHtml(f.label || f.english || '') + '</b>';
    if (f.url) {
      html += ' <a target="_blank" rel="noopener" href="' + escHtml(f.url) + '">' +
        I18N.ui.wikiLinkLabel + '</a>';
    }
    return html;
  }
  function openCatalogFeature(f) {
    engine.panTo(catalogLatLng(f));
    engine.popup(catalogLatLng(f), catalogPopupHtml(f));
  }

  // ---------- overlay creation ----------
  function markLocation(key, loc) {
    if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return false;
    var url = loc.url || 'https://awoiaf.westeros.org/index.php/' + key;
    return engine.marker({
      position: [loc.lat, loc.lng],
      title: displayName(key),
      icon: hitIcon(),
      visible: true,
      onClick: function () {
        // Ctrl/Meta-click shares the location hash exactly like the original;
        // a normal click opens the SAME original reference URL directly.
        if (ctrlPressed) { window.location.hash = '@' + key; }
        else { window.open(url, '_blank', 'noopener'); }
      },
    });
  }

  function createPolygon(region) {
    return engine.polygon({
      paths: region.coords,
      fillColor: region.color,
      fillOpacity: 0.7,
      strokeWeight: 0,
      visible: false,
      onClick: function () {
        window.open('https://awoiaf.westeros.org/index.php/' + region.key, '_blank', 'noopener');
      },
    });
  }

  function markNobility(opt) {
    if (typeof opt.img !== 'string') return false;
    var coords = (typeof opt.seatKey === 'string')
      ? checkLocKey(opt.seatKey)
      : checkLocKey('', opt.lat, opt.lng);
    if (!coords) return false;
    var title = (typeof opt.wikiKey === 'string')
      ? decodeURI(opt.wikiKey).replace(/_/g, ' ') : 'Sem nome';
    if (typeof opt.clue === 'string') {
      if (opt.clue === 'mountain clan') title = title.replace(/House/, 'Clan');
      else title += ' (' + opt.clue + ')';
    }
    var isGreat = opt.isGreat != null ? opt.isGreat : false;
    var imgRatio = typeof opt.imgRatio === 'number' ? opt.imgRatio : 4 / 3;
    var imgHeight = isGreat ? 60 : 30;
    var w = Math.round(imgHeight / imgRatio);
    var anchor = Array.isArray(opt.anchor) ? opt.anchor : [w / 2, imgHeight / 2];
    var marker = engine.marker({
      position: coords,
      title: I18N.houseName(opt.wikiKey) || title,
      icon: { url: heraldryUrl(opt.img, title), size: [w, imgHeight], anchor: anchor },
      visible: false,
      onClick: (typeof opt.wikiKey === 'string') ? function () {
        window.open('https://awoiaf.westeros.org/index.php/' + opt.wikiKey, '_blank', 'noopener');
      } : null,
    });
    marker.isGreat = isGreat;
    marker.ranges = CORE.nobilityRanges(opt);
    return marker;
  }

  function markPathSegment(opt) {
    var overlay = null;
    if (typeof opt.icon === 'string') {
      var pos = null;
      if (typeof opt.key === 'string') {
        var cr = checkLocKey(opt.key);
        if (!cr) { console.log('Path key desconhecida: ' + opt.key); return false; }
        pos = cr;
      } else if (Array.isArray(opt.coord) && opt.coord.length === 2) {
        pos = checkLocKey('', opt.coord[0], opt.coord[1]);
        if (!pos) { console.log('Coordenada fora do mapa: ' + opt.coord); return false; }
      }
      if (pos) {
        overlay = engine.marker({
          position: pos,
          icon: pinIcon(opt.icon),
          visible: false,
        });
      }
    }
    if (typeof opt.line === 'string') {
      if (!Array.isArray(opt.path)) { console.log('Segmento de trajeto sem path'); return false; }
      var path = [];
      for (var i = 0; i < opt.path.length; i++) {
        var p = opt.path[i];
        if (typeof p === 'string') {
          var r = checkLocKey(p);
          if (r) path.push(r);
        } else if (Array.isArray(p) && p.length === 2) {
          if (checkLocKey('', p[0], p[1])) path.push(p);
        }
      }
      overlay = engine.polyline({
        path: path, color: opt.line, weight: 8, opacity: 1.0, visible: false,
      });
    }
    if (typeof opt.arrow === 'string') {
      if (!Array.isArray(opt.coord) || opt.coord.length !== 2 || typeof opt.heading !== 'number') {
        console.log('Seta de trajeto incompleta'); return false;
      }
      overlay = engine.arrow(opt.coord, opt.heading, opt.arrow, 1);
    }
    if (!overlay) return false;
    overlay.ranges = CORE.pathRanges(opt);
    return overlay;
  }

  // ---------- spoilers ----------
  // Books-only: chapter is the sole timeline mode.
  function currentMode() {
    return 'C';
  }
  function currentIndex() {
    var v = $('#chapSlider').val();
    return parseInt(v, 10) || 0;
  }

  function displayCharacter(character, mode, index) {
    var list = pathOverlays[character] || [];
    if (mode === 'hide') {
      for (var i = 0; i < list.length; i++) list[i].setVisible(false);
      return false;
    }
    var markerOnly = $('#showMarkerOnly').prop('checked');
    var currentPosition = null;
    for (var j = 0; j < list.length; j++) {
      var ov = list[j];
      var vis = CORE.pathOverlayVisible(ov.ranges, ov.kind, mode, index, markerOnly);
      ov.setVisible(vis);
      if (vis && ov.position) currentPosition = ov.position;
    }
    return currentPosition;
  }

  function updatePathDisplay(mode, index) {
    if (typeof mode !== 'string') {
      mode = currentMode(); // fix: read the CHECKED radio, not the first input
      index = currentIndex();
    }
    var aegonVisible = parseInt($('#chapSlider').val(), 10) >= 289;
    for (var character in pathOverlays) {
      var $t = $('#toggle_' + character);
      var liVisible = character !== 'aegon' || aegonVisible;
      if ($t.prop('checked') && liVisible) displayCharacter(character, mode, index);
      else displayCharacter(character, 'hide');
    }
    if (aegonVisible) {
      $('.aegonListItem').show();
    } else {
      $('.aegonListItem').hide();
      var $a = $('#toggle_aegon');
      if ($a.prop('checked')) { $a.prop('checked', false); displayCharacter('aegon', 'hide'); }
      $('#allCharacters').text(I18N.ui.selectAll);
      setJqmText('#hhSelectAll', I18N.ui.selectAll);
    }
  }

  function updateNobilityDisplay() {
    var showGreat = document.getElementById('toggle_regions').checked;
    var showMinor = document.getElementById('toggle_nobility').checked;
    var idx = currentIndex();
    for (var i = 0; i < nobilityOverlays.length; i++) {
      var n = nobilityOverlays[i];
      if (!n) continue;
      var inTimeframe = CORE.inRange(n.ranges.chapters, idx);
      n.setVisible(inTimeframe && (showMinor || (n.isGreat && showGreat)));
    }
  }

  function setChapTitle(i) {
    var ch = chapters[i];
    if (!ch) return;
    var t = I18N.chapterTitle(ch.title);
    $('#chapTitle').attr('title', t)
      .html("<a target='_blank' rel='noopener' href='" + ch.url + "'>" + t + '</a>');
  }
  function sliderIncrement(i) {
    var $slider = $('#chapSlider');
    var cur = parseInt($slider.val(), 10) || 0;
    var max = parseInt($slider.attr('max'), 10) || 0;
    var next = CORE.clamp(cur + i, 0, max); // fix: clamp BEFORE reading titles
    if (next === cur) return;
    $slider.val(next).slider('refresh');
    setChapTitle(next);
    updatePathDisplay('C', next);
    updateNobilityDisplay(); // fix: arrows update nobility too
  }

  // ---------- labels ----------
  // Consistent italic Georgia measure for catalog + fallback labels;
  // one shared deterministic placement pass (GOTMAP_LABELS) collides them
  // against each other, the viewport and overlay UI. Required catalog
  // labels stay required at z4+; overview names and fallbacks may declutter.
  var LAYOUT = window.GOTMAP_LABELS;
  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');
  var measureCache = {};
  function measureLabel(text, fontPx) {
    var k = fontPx + '|' + text;
    var m = measureCache[k];
    if (!m) {
      measureCtx.font = 'italic ' + fontPx + 'px ' + LAYOUT.FONT_FAMILY;
      m = { w: measureCtx.measureText(text).width, h: fontPx * 1.2 };
      measureCache[k] = m;
    }
    return { w: m.w, h: m.h }; // copy: callers pad w/h with stroke overhang
  }

  // UI chrome rectangles that labels must not slip under
  function labelObstacles() {
    var base = document.getElementById('map_canvas').getBoundingClientRect();
    var out = [];
    ['#filter', '.gotmap-layer-control', '#mapLegend', '.leaflet-control-zoom']
      .forEach(function (sel) {
        var el = document.querySelector(sel);
        if (!el || getComputedStyle(el).display === 'none') return;
        var r = el.getBoundingClientRect();
        out.push({
          x1: r.left - base.left, y1: r.top - base.top,
          x2: r.right - base.left, y2: r.bottom - base.top,
        });
      });
    return out;
  }

  // overview placement priorities (z<=3): heavy geography first so minor
  // names declutter instead of boxing it in; z4+ keeps the settled order
  function overviewPriority(kind) {
    if (kind === 'continent') return 200;
    if (kind === 'water') return 180;
    if (kind === 'forest') return 150;
    return LAYOUT.priorityFor(kind, false);
  }

  var pendingLabelFrame = null;
  var pendingLabelTimer = null;
  var lastLayoutSig = null;
  var raf = window.requestAnimationFrame ||
    function (f) { return setTimeout(f, 16); };
  var caf = window.cancelAnimationFrame || clearTimeout;
  function scheduleLabels() {
    if (pendingLabelFrame != null) return; // one pending pass per frame
    function run() {
      if (pendingLabelFrame == null) return;
      pendingLabelFrame = null;
      if (pendingLabelTimer != null) {
        clearTimeout(pendingLabelTimer); pendingLabelTimer = null;
      }
      rebuildLabels();
    }
    // rAF coalesces to the rendered frame in real browsers; the timeout is
    // the deterministic fallback where rAF starves (headless/no frames)
    pendingLabelFrame = raf(run);
    pendingLabelTimer = setTimeout(function () {
      if (pendingLabelFrame != null) caf(pendingLabelFrame);
      run();
    }, 60);
  }

  function rebuildLabels() {
    if (!engine) return;
    var ptMode = engine.getBaseLayer() === 'pt';
    var zoom = engine.getZoom();
    var size = engine.getContainerSize();
    var obstacles = labelObstacles();
    var center = engine.getCenter ? engine.getCenter() : [0, 0];
    var origin = engine.project([0, 0]); // catches transient pixel origins
    var sig = [engine.getBaseLayer(), zoom,
      center[0].toFixed(6) + ',' + center[1].toFixed(6),
      size.w, size.h,
      origin ? origin.x.toFixed(2) + ',' + origin.y.toFixed(2) : '',
      obstacles.map(function (o) {
        return Math.round(o.x1) + ',' + Math.round(o.y1) + ',' +
          Math.round(o.x2) + ',' + Math.round(o.y2);
      }).join(';')].join('|');
    if (sig === lastLayoutSig) return; // repeated events, identical geometry
    lastLayoutSig = sig;

    var overview = zoom <= 3;
    var items = [];
    var refs = {};

    catalogLabelOverlays.forEach(function (cl, i) {
      // level-of-detail gate + offscreen cull BEFORE any measure/layout work;
      // at z4+ anchors inside the viewport are never dropped for collision
      // (overview zooms may declutter optional names, by design)
      if (!ptMode || zoom < cl.minZ) { cl.ov.setVisible(false); return; }
      var p = engine.project(cl.ov.position);
      if (!p || p.x < 0 || p.y < 0 ||
          p.x > size.w || p.y > size.h) {
        cl.ov.setVisible(false); return;
      }
      var fs = LAYOUT.fontStyle(cl.kind, zoom);
      var m = measureLabel(cl.text, fs.fontSize);
      // stroke + italic overhang so neighbours don't clip the outline
      m.w += fs.strokeWidth * 2 + fs.fontSize * 0.12;
      m.h += fs.strokeWidth;
      var box = LAYOUT.rotatedBox(m.w, m.h, cl.angle || 0,
        cl.curve ? Math.min(14, m.w * 0.09) : 0);
      var id = 'c' + i;
      refs[id] = { cl: cl, fs: fs };
      items.push({
        id: id, anchor: { x: p.x, y: p.y },
        width: box.w, height: box.h,
        // overview: admitted names are optional (user-approved declutter);
        // z4+ keeps every catalog label required as settled
        priority: overview ? overviewPriority(cl.kind)
                           : LAYOUT.priorityFor(cl.kind, false),
        optional: overview,
      });
    });

    var OFF = 9; // fallback labels sit right of their anchor point
    function pushFallback(list, i, ov, anchor) {
      var fs = LAYOUT.fontStyle(ov.kind || 'town', zoom);
      var m = measureLabel(ov.text, fs.fontSize);
      var id = 'f' + list + i;
      refs[id] = { fb: ov, fs: fs, halfW: m.w / 2 };
      items.push({
        id: id,
        anchor: { x: anchor.x + OFF + m.w / 2, y: anchor.y },
        width: m.w, height: m.h,
        priority: LAYOUT.priorityFor(null, true), optional: true,
        point: { x: anchor.x, y: anchor.y },
      });
    }
    geoLabelOverlays.forEach(function (ov, i) {
      if (!ptMode || zoom < ov.minZ || zoom > ov.maxZ) { ov.setVisible(false); return; }
      var p = engine.project(ov.position);
      if (!p || p.x < -30 || p.y < 0 || p.x > size.w + 30 || p.y > size.h) {
        ov.setVisible(false); return;
      }
      pushFallback('g', i, ov, p);
    });
    townLabelOverlays.forEach(function (ov, i) {
      if (!ptMode || zoom < ov.minZ) { ov.setVisible(false); return; }
      var p = engine.project(ov.position);
      if (!p || p.x < -30 || p.y < 0 || p.x > size.w + 30 || p.y > size.h) {
        ov.setVisible(false); return;
      }
      pushFallback('t', i, ov, p);
    });

    var placements = LAYOUT.placeLabels(items, size, obstacles);
    lastLayout = { items: items, placements: placements,
      boosted: LAYOUT.placeLabels.lastBoosted,
      viewport: size, obstacles: obstacles, zoom: zoom };
    items.forEach(function (it) {
      var pl = placements[it.id];
      var r = refs[it.id];
      var disp = Math.hypot(pl.dx, pl.dy);
      if (r.cl) {
        r.cl.ov.setStyle({
          fontSize: r.fs.fontSize, strokeWidth: r.fs.strokeWidth,
          offsetX: pl.dx, offsetY: pl.dy,
          curve: r.cl.curve || 0, overlap: pl.overlap,
          leader: (r.cl.key && disp > 18)
            ? { dx: pl.dx, dy: pl.dy } : null,
        });
        r.cl.ov.setVisible(!!pl.visible);
      } else {
        r.fb.setStyle({
          fontSize: r.fs.fontSize, strokeWidth: r.fs.strokeWidth,
          offsetX: pl.dx, offsetY: pl.dy,
          leader: disp > 18
            ? { dx: OFF + r.halfW + pl.dx, dy: pl.dy } : null,
        });
        r.fb.setVisible(!!pl.visible);
      }
    });
  }

  // ---------- engine boot ----------
  function showStatus(msg) {
    var el = document.getElementById('engineStatus');
    if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
  }

  // tear down everything a previous engine built so a fallback re-init does
  // not duplicate overlays, search entries or delegated handlers.
  function disposeMap() {
    // a pending scheduled pass must not touch the next engine instance
    if (pendingLabelFrame != null) {
      caf(pendingLabelFrame);
      pendingLabelFrame = null;
    }
    if (pendingLabelTimer != null) {
      clearTimeout(pendingLabelTimer);
      pendingLabelTimer = null;
    }
    lastLayoutSig = null;
    lastLayout = null;
    if (engine && engine.dispose) engine.dispose();
    engine = null;
    regionOverlays = [];
    nobilityOverlays = [];
    pathOverlays = {};
    townLabelOverlays = [];
    geoLabelOverlays = [];
    catalogLabelOverlays = [];
    catalogKeys = {};
    catalogById = {};
    seatHouses = {};
    $('#townSelector li').remove();
  }

  function initMap(factory, statusOverride) {
    var parsed = CORE.parseHash(window.location.href);
    var center = [0, -105];
    var startKey = null;
    var startCatId = null;
    if (parsed.kind === 'coords') center = [parsed.lat, parsed.lng];
    else if (parsed.kind === 'key') {
      var k = parsed.key;
      if (!window.locations[k] && window.locations[k.replace(/'/g, '%27')]) k = k.replace(/'/g, '%27');
      var c = checkLocKey(k);
      if (c) { center = c; startKey = k; }
      else startCatId = k; // maybe a catalog-only feature id
    }

    engine = factory(center);
    window.GOTMAP.engine = engine;

    // towns
    var alphaLocations = Object.keys(window.locations);
    alphaLocations.sort(function (a, b) {
      return displayName(a).localeCompare(displayName(b), 'pt-BR');
    });
    alphaLocations.forEach(function (key) { markLocation(key, window.locations[key]); });

    // seat -> houses (temporal list built BEFORE nobility markers)
    nobility.forEach(function (n) {
      if (typeof n.seatKey === 'string') {
        (seatHouses[n.seatKey] = seatHouses[n.seatKey] || []).push({
          name: I18N.houseName(n.wikiKey),
          img: heraldryUrl(n.img, n.wikiKey),
          ranges: CORE.nobilityRanges(n),
          isGreat: !!n.isGreat,
        });
      }
    });
    if (!seatHouses.Winterfell) {
      seatHouses.Winterfell = [{
        name: 'Casa Stark',
        img: heraldryUrl('https://awoiaf.westeros.org/images/thumb/5/51/House_Stark.PNG/90px-House_Stark.PNG', 'Stark'),
        ranges: { chapters: [0, 999] },
      }];
    }

    // regions / nobility / paths
    regions.forEach(function (r) { regionOverlays.push(createPolygon(r)); });
    nobility.forEach(function (n) {
      var m = markNobility(n);
      if (m) nobilityOverlays.push(m);
    });
    for (var ch in paths) {
      pathOverlays[ch] = [];
      for (var i = 0; i < paths[ch].length; i++) {
        var ov = markPathSegment(paths[ch][i]);
        if (ov) pathOverlays[ch].push(ov);
      }
      if (pathOverlays[ch].length) $('#toggle_' + ch).removeAttr('disabled');
    }

    // labels - the generic geo labels are only the EMPTY-catalog fallback;
    // once the source-aligned catalog exists they would duplicate displaced
    // geography, so they are skipped entirely.
    if (!(CATALOG.features || []).length) {
      I18N.geoLabels.forEach(function (g) {
        var ov = engine.label([g.lat, g.lng], g.text, { className: g.cls });
        ov.minZ = g.minZ; ov.maxZ = g.maxZ; ov.cls = g.cls;
        geoLabelOverlays.push(ov);
      });
    }
    // Curated long-form labels rendered along a gentle SVG arc; the sign
    // carries direction and the renderer derives sagitta from text width.
    var CURVED_IDS = {
      Narrow_Sea: 1, Shivering_Sea: -1, Blackwater_Bay: 1, Bay_of_Crabs: -1,
      Bay_of_Ice: 1, Dornish_Marches: -1, Wolfswood: 1, Forest_of_Qohor: -1,
    };
    var majors = {};
    I18N.majorTowns.forEach(function (k) { majors[k] = 1; });
    // Source-aligned catalog labels: category-scaled with zoom, centered on
    // the original label position, never dropped for overlap at z4+
    // (placement may offset + leader). Search dedups by id.
    (CATALOG.features || []).forEach(function (f, fi) {
      var fid = f.id || ('cat' + fi);
      var pos = catalogLatLng(f);
      var key = (f.key && window.locations[f.key]) ? f.key : null;
      var text = key ? displayName(key) : (f.label || f.english || '');
      if (!text) return;
      if (key) catalogKeys[key] = true;
      else if (!catalogById[fid]) catalogById[fid] = f; // first instance -> hash target
      // level-of-detail: source font size + major status decide the lowest
      // zoom at which this name is eligible (f.fontSize = artwork size)
      var major = !!(key && majors[key]) || !!majors[fid];
      var minZ = LAYOUT.minZoomForLabel(f.kind, major, f.fontSize || 0);
      (function (key, url) {
        var ov = engine.label(pos, text, {
          className: 'gotmap-label-cat',
          kind: f.kind,
          centered: true,
          angle: f.angle || 0,
          url: url,
          onCtrlClick: key ? function () { window.location.hash = '@' + key; } : null,
        });
        catalogLabelOverlays.push({
          ov: ov, key: key, text: text, kind: f.kind, minZ: minZ,
          angle: f.angle || 0, curve: CURVED_IDS[fid] || 0,
        });
      })(key, key ? locUrl(key) : (f.url || null));
    });
    alphaLocations.forEach(function (key) {
      if (catalogKeys[key]) return; // catalog already labels this location
      var loc = window.locations[key];
      var importance = majors[key] ? 4 : (seatHouses[key] ? 2 : 1);
      var minZ = importance === 4 ? 2 : 4; // no seat/minor names at overview
      var ov = engine.label([loc.lat, loc.lng], displayName(key), {
        className: 'town',
        kind: majors[key] ? 'city' : 'castle',
      });
      ov.minZ = minZ; ov.importance = importance;
      ov.cls = 'town';
      townLabelOverlays.push(ov);
    });

    engine.onMove(scheduleLabels); // one layout pass per rendered frame
    engine.onBaseLayerChange(scheduleLabels);
    rebuildLabels(); // initial pass synchronous
    showStatus(statusOverride ||
      (engine.kind === 'leaflet' ? I18N.ui.engineLeaflet : I18N.ui.engineGoogle));

    // search list
    alphaLocations.forEach(function (key) {
      var name = displayName(key);
      var en = CORE.decodeLocationKey(key);
      var house = seatHouses[key] ? seatHouses[key][0].name : '';
      var aliases = (I18N.townAliases[key] || []).join(' ');
      var ft = CORE.normalizeText(name + ' ' + en + ' ' + house + ' ' + aliases);
      $('#townSelector').append(
        '<li data-corners="false" data-shadow="false" data-iconshadow="true" data-wrapperels="div" data-icon="arrow-r" data-iconpos="right" data-theme="c" class="ui-btn ui-btn-up-c ui-btn-icon-right ui-li-has-arrow ui-li ui-screen-hidden" data-filtertext="' +
        escHtml(ft) + '"><div class="ui-btn-inner ui-li"><div class="ui-btn-text"><a id="link' + key +
        '" href="#@' + key + '" class="ui-link-inherit">' + escHtml(name) + '</a></div><span class="ui-icon ui-icon-arrow-r ui-icon-shadow">&nbsp;</span></div></li>'
      );
    });
    // catalog-only features merge into search (no duplicates of raw keys
    // and one entry per catalog id, even if the source repeats a label)
    var searchCatIds = {};
    (CATALOG.features || []).forEach(function (f, i) {
      if (f.key && window.locations[f.key]) return;
      var name = f.label || f.english;
      if (!name) return;
      var fid = f.id || ('cat' + i);
      if (searchCatIds[fid]) return;
      searchCatIds[fid] = true;
      var ft = CORE.normalizeText(name + ' ' + (f.english || ''));
      $('#townSelector').append(
        '<li data-corners="false" data-shadow="false" data-iconshadow="true" data-wrapperels="div" data-icon="arrow-r" data-iconpos="right" data-theme="c" class="ui-btn ui-btn-up-c ui-btn-icon-right ui-li-has-arrow ui-li ui-screen-hidden" data-filtertext="' +
        escHtml(ft) + '"><div class="ui-btn-inner ui-li"><div class="ui-btn-text"><a id="linkcat' + i +
        '" href="#@' + escHtml(fid) + '" data-cat="' + escHtml(fid) + '" class="ui-link-inherit">' + escHtml(name) +
        '</a></div><span class="ui-icon ui-icon-arrow-r ui-icon-shadow">&nbsp;</span></div></li>'
      );
    });
    var $ts = $('#townSelector');
    $ts.listview();
    $ts.listview('option', 'filterCallback', function (text, search) {
      return !CORE.searchMatches(text, search);
    });
    $('#lightboxLink').on('click', function (e) {
      e.preventDefault();
      closeLightbox();
      openTownPopup('Winterfell');
      if (isMobile()) setMobileView('map');
    });

    if (startKey) openTownPopup(startKey);
    else if (startCatId && catalogById[startCatId]) {
      openCatalogFeature(catalogById[startCatId]);
    }

    engine.onClick(function (latlng, ev) {
      if (ev.ctrl) {
        window.location.hash = '@' + latlng[0] + ',' + latlng[1];
        engine.panTo(latlng);
      }
    });

    window.GOTMAP_DEBUG = {
      engine: engine,
      locations: window.locations,
      paths: window.paths,
      nobility: nobilityOverlays,
      regions: regionOverlays,
      seatHouses: seatHouses,
      displayCharacter: displayCharacter,
      updatePathDisplay: updatePathDisplay,
      updateNobilityDisplay: updateNobilityDisplay,
      currentMode: currentMode,
      currentIndex: currentIndex,
      labelCount: function () {
        var n = 0;
        townLabelOverlays.forEach(function (o) { if (o.getVisible()) n++; });
        return n;
      },
      lastLayout: function () { return lastLayout; },
      visibleFeatures: function () {
        var out = [];
        catalogLabelOverlays.forEach(function (cl) {
          if (cl.ov.getVisible()) out.push(cl.key || cl.text);
        });
        return out;
      },
      visiblePaths: function () {
        var out = [];
        for (var c in pathOverlays) pathOverlays[c].forEach(function (o) {
          if (o.getVisible()) out.push({ character: c, kind: o.kind });
        });
        return out;
      },
    };
  }

  applyIconStyles();

  // ---------- engine selection ----------
  // loaded = the Google script finished booting an engine; failed = a
  // permanent Google failure already triggered the Leaflet fallback. Kept
  // separate because gm_authFailure commonly fires AFTER the callback
  // created the map, and the fallback must still run (exactly once).
  var googleState = { loaded: false, failed: false };

  function bootLeaflet(statusOverride) {
    initMap(function (center) {
      return GOTMAP.createLeafletEngine(document.getElementById('map_canvas'), { center: center, zoom: 4 });
    }, statusOverride);
  }

  function fallbackToLeaflet() {
    if (googleState.failed) return;
    googleState.failed = true;
    disposeMap();
    bootLeaflet(I18N.ui.engineFallback);
    // re-apply the current UI selections on the rebuilt overlays
    updatePathDisplay();
    updateNobilityDisplay();
    if ($('#toggle_regions').prop('checked')) $('#toggle_regions').triggerHandler('change');
  }

  function bootGoogle(key) {
    window.gm_authFailure = fallbackToLeaflet;
    window.__gotmapGoogleReady = function () {
      if (googleState.failed || googleState.loaded) return;
      googleState.loaded = true;
      try {
        initMap(function (center) {
          return GOTMAP.createGoogleEngine(document.getElementById('map_canvas'), { center: center, zoom: 4 });
        });
      } catch (err) {
        fallbackToLeaflet();
      }
    };
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
      '&language=pt-BR&callback=__gotmapGoogleReady';
    s.async = true;
    s.onerror = function () { if (!googleState.loaded) fallbackToLeaflet(); };
    document.head.appendChild(s);
    setTimeout(function () {
      if (!googleState.loaded) fallbackToLeaflet();
    }, 15000);
  }

  // ---------- mobile views (map | menu | chars) ----------
  function isMobile() { return window.innerWidth <= 600; }
  var mobileView = 'map';
  var mobileAboutReturn = null; // view to restore when about closes on mobile
  function setMobileView(v) {
    mobileView = v;
    if (!isMobile()) return;
    $('#map_canvas, #menuButton').toggle(v === 'map');
    $('#filter').toggle(v === 'menu');
    $('#handheldToggles').toggle(v === 'chars');
  }

  // ---------- UI wiring (engine-independent) ----------
  function openAbout() {
    if (isMobile()) {
      mobileAboutReturn = mobileView;
      $('#filter, #handheldToggles').hide();
    }
    $('#shade, #lightbox').show();
  }
  function closeLightbox() {
    $('#shade, #lightbox').hide();
    if (isMobile()) {
      setMobileView(mobileAboutReturn || mobileView); // never leave all views hidden
      mobileAboutReturn = null;
    }
  }
  $('#infoLink').click(openAbout);
  $('#closeButton').click(closeLightbox);
  $(document).on('keydown', function (e) {
    if (e.key === 'Escape' && $('#lightbox').is(':visible')) closeLightbox();
  });

  setChapTitle(0);
  $('#chapSlider').change(function () {
    var i = CORE.clamp($(this).val(), 0, chapters.length - 1);
    setChapTitle(i);
    updateNobilityDisplay();
    updatePathDisplay('C', i);
  }).attr('max', chapters.length - 1).slider('refresh');

  var timeout = null;
  $('#slideUp').click(function () { sliderIncrement(1); });
  $('#slideDown').click(function () { sliderIncrement(-1); });
  $('#slideUp').mousedown(function () {
    timeout = setInterval(function () { sliderIncrement(1); }, 100);
    return false;
  });
  $('#slideDown').mousedown(function () {
    timeout = setInterval(function () { sliderIncrement(-1); }, 100);
    return false;
  });
  $(document).mouseup(function () { clearInterval(timeout); return false; });
  // (native <button> elements: Enter/Space already fire click)

  $('#toggle_nobility').change(function () { updateNobilityDisplay(); });
  $('#toggle_regions').change(function () {
    updateNobilityDisplay();
    if (this.checked) {
      $('#legend').show();
      regionOverlays.forEach(function (r) { r.setVisible(true); });
    } else {
      $('#legend').hide();
      regionOverlays.forEach(function (r) { r.setVisible(false); });
    }
  });

  // keep the mobile proxy labels in sync with the canonical controls
  function setJqmText(sel, text) {
    var $el = $(sel);
    var $t = $el.find('.ui-btn-text');
    if ($t.length) $t.text(text); else $el.text(text);
  }
  function setAllLabel(t) {
    $('#allCharacters').text(t);
    setJqmText('#hhSelectAll', t);
  }
  function setPathLabel(t) {
    $('#pathDisplay').text(t);
    setJqmText('#hhPathDisplay', t);
  }

  $('#allCharacters, #hhSelectAll').click(function () {
    var $visibleToggles = $('.pathToggle').filter(function () {
      return $(this).closest('li').css('display') !== 'none' &&
        $(this).closest('ul').css('display') !== 'none';
    });
    var allChecked = $visibleToggles.length > 0 &&
      $visibleToggles.filter(':checked').length === $visibleToggles.length;
    if (allChecked) {
      $visibleToggles.prop('checked', false).each(function () {
        displayCharacter(this.id.substr(7), 'hide');
      });
      setAllLabel(I18N.ui.selectAll);
    } else {
      var mode = currentMode();
      var idx = currentIndex();
      $visibleToggles.prop('checked', true).each(function () {
        displayCharacter(this.id.substr(7), mode, idx);
      });
      setAllLabel(I18N.ui.hideAll);
    }
  });

  $('#pathDisplay, #hhPathDisplay').click(function () {
    var mo = !$('#showMarkerOnly').prop('checked');
    $('#showMarkerOnly').prop('checked', mo);
    setPathLabel(mo ? I18N.ui.fullPath : I18N.ui.currentOnly);
    updatePathDisplay();
  });
  $('#showMarkerOnly').prop('checked', false);

  $('.pathToggle').change(function () {
    var character = this.id.substr(7);
    if (!this.checked) {
      displayCharacter(character, 'hide');
      $('#allCharacters').text(I18N.ui.selectAll);
      setJqmText('#hhSelectAll', I18N.ui.selectAll);
    } else {
      var pos = displayCharacter(character, currentMode(), currentIndex());
      if (pos && engine) { // fix: do not pan when there is no current marker
        engine.panTo(pos);
      }
    }
  });

  // hash navigation (shared links)
  $(window).on('hashchange', function () {
    var parsed = CORE.parseHash(window.location.href);
    if (!engine) return;
    if (parsed.kind === 'coords') engine.panTo([parsed.lat, parsed.lng]);
    else if (parsed.kind === 'key') {
      var k = parsed.key;
      if (!window.locations[k] && window.locations[k.replace(/'/g, '%27')]) k = k.replace(/'/g, '%27');
      if (window.locations[k]) openTownPopup(k);
      else if (catalogById[k]) openCatalogFeature(catalogById[k]);
    }
  });

  // mobile interface
  $('#menuButton').click(function () {
    setMobileView(mobileView === 'map' ? 'menu' : 'map');
  });
  $('#returnToMap').click(function () { setMobileView('map'); });
  // delegated: survives engine fallback rebuilds of the list items
  $('#townSelector').on('click', 'a.ui-link-inherit', function (e) {
    e.preventDefault();
    var catId = $(this).attr('data-cat');
    if (catId != null) {
      var f = catalogById[catId];
      if (f) openCatalogFeature(f);
      $('input[data-type="search"]').val('').trigger('keyup');
      if (isMobile()) setMobileView('map');
      return false;
    }
    var key = $(this).attr('href').substring(2);
    openTownPopup(key);
    $('input[data-type="search"]').val('').trigger('keyup');
    if (isMobile()) setMobileView('map');
    return false;
  });
  $('#showCharacterPaths').click(function () { setMobileView('chars'); });
  $('#closeCharList').click(function () { setMobileView('menu'); });
  $('#aboutThisSite').click(openAbout);
  function setLegend(open) {
    $('#mapLegend').toggle(open);
    $('#legendToggle, #htLegend').attr('aria-expanded', open ? 'true' : 'false');
    scheduleLabels(); // panel is a placement obstacle; keep labels clear
  }
  $('#legendToggle').click(function () { setLegend(!$('#mapLegend').is(':visible')); });
  $('#htLegend').click(function () { setLegend(!$('#mapLegend').is(':visible')); });
  $('#legendClose').click(function () { setLegend(false); });
  // user wants the legend box visible by default on desktop; mobile starts
  // closed but keeps the floating button (single initial decision, not a
  // resize handler, so a later resize never overrides the user's choice).
  setLegend(!isMobile());
  $('#handheldCloseButton').click(function () {
    mobileAboutReturn = 'menu';
    closeLightbox();
  });
  $('#htRegions, #htNobility, #handheldToggles label').click(function () {
    $(this).find('span.ui-icon').toggle();
  }).find('span.ui-icon').hide();

  // keep the map usable when the viewport crosses the mobile breakpoint:
  // normalize inline display styles left over from the other layout and
  // tell the engine its container size may have changed.
  var wasMobile = isMobile();
  $(window).on('resize', function () {
    var nowMobile = isMobile();
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (nowMobile) {
        setMobileView(mobileView);
      } else {
        $('#map_canvas, #menuButton, #filter, #handheldToggles').css('display', '');
        mobileAboutReturn = null;
      }
    }
    if (engine && engine.invalidateSize) engine.invalidateSize();
    scheduleLabels();
  });

  // boot
  var cfg = window.GOTMAP_CONFIG || {};
  if (cfg.googleMapsApiKey) bootGoogle(cfg.googleMapsApiKey);
  else bootLeaflet();
});
