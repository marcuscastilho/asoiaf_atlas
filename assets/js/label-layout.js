// Label typography + deterministic placement helpers.
// UMD: window.GOTMAP_LABELS in the browser, module.exports for unit tests.
// Pure geometry - no DOM or engine dependencies beyond an optional canvas
// measuring context injected by the caller.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GOTMAP_LABELS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // z4 base pixel sizes per source-category (settled spec).
  var BASE = {
    city: 14, town: 12, castle: 12, ruin: 12, other: 12,
    forest: 13, water: 15, island: 12, mountain: 13,
    region: 14, continent: 22, road: 11,
  };
  var CAP = { continent: 26, water: 18, city: 17 };
  var DEFAULT_CAP = 16;
  var MIN = 9;
  var FONT = 'Georgia,\'Times New Roman\',serif';
  var FONT_STYLE = 'italic';

  // fontSize = base * 2^((zoom-4)*0.25), clamped [MIN, cap]; white outline
  // clamp(font*0.08, 0.7, 1.4).
  function fontStyle(kind, zoom) {
    var base = BASE[kind] != null ? BASE[kind] : 12;
    var cap = CAP[kind] != null ? CAP[kind] : DEFAULT_CAP;
    var px = base * Math.pow(2, (zoom - 4) * 0.25);
    px = Math.max(MIN, Math.min(cap, px));
    return {
      fontSize: Math.round(px * 100) / 100,
      strokeWidth: Math.max(0.7, Math.min(1.4, px * 0.08)),
      font: FONT_STYLE + ' ' + Math.round(px * 100) / 100 + 'px ' + FONT,
      family: FONT,
      style: FONT_STYLE,
    };
  }

  // deterministic catalog/fallback priorities (higher wins placement first)
  function priorityFor(kind, fallback) {
    if (fallback) return 10;
    switch (kind) {
      case 'city': return 100;
      case 'town': case 'castle': case 'ruin': case 'other': return 90;
      case 'forest': return 70;
      case 'water': case 'island': return 60;
      case 'region': return 50;
      case 'continent': return 40;
      case 'road': case 'mountain': return 40;
      default: return 60;
    }
  }

  // ---- deterministic placement ----------------------------------------
  // items: {id, anchor:{x,y}, width, height, priority, optional}
  // viewport: {w,h} container-pixel box; obstacles: [{x1,y1,x2,y2}]
  // returns {id: {dx, dy, overlap, visible}}; required items are NEVER
  // silently discarded - worst case they keep a flagged-overlap box and
  // their source box is RESERVED so later labels avoid it too.
  var MAX_OFFSET = 96, TRAPPED_OFFSET = 192, STEP = 8;
  var GAP = 2;

  // candidate offsets: full dx,dy grid (mixed non-compass slots included),
  // sorted by squared displacement, stable ties
  var CANDS = (function () {
    var c = [];
    for (var dy = -MAX_OFFSET; dy <= MAX_OFFSET; dy += STEP) {
      for (var dx = -MAX_OFFSET; dx <= MAX_OFFSET; dx += STEP) {
        c.push([dx, dy, dx * dx + dy * dy]);
      }
    }
    c.sort(function (a, b) { return a[2] - b[2]; });
    return c;
  })();

  // extended ring for required labels trapped by viewport/UI geometry:
  // same deterministic ordering, only the 96<dist<=192 shell
  var CANDS_FAR = (function () {
    var c = [];
    for (var dy = -TRAPPED_OFFSET; dy <= TRAPPED_OFFSET; dy += STEP) {
      for (var dx = -TRAPPED_OFFSET; dx <= TRAPPED_OFFSET; dx += STEP) {
        var d2 = dx * dx + dy * dy;
        if (d2 > MAX_OFFSET * MAX_OFFSET && d2 <= TRAPPED_OFFSET * TRAPPED_OFFSET) {
          c.push([dx, dy, d2]);
        }
      }
    }
    c.sort(function (a, b) { return a[2] - b[2]; });
    return c;
  })();

  function intersects(a, b) {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }
  function overlapArea(a, b) {
    var w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    var h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return (w > 0 && h > 0) ? w * h : 0;
  }
  function insideViewport(box, vp) {
    return box.x1 >= 0 && box.y1 >= 0 && box.x2 <= vp.w && box.y2 <= vp.h;
  }

  function runPass(items, viewport, obstacles, boosted) {
    var placed = [];   // committed gap-padded boxes
    var result = {};
    var order = items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        // repack: previously-flagged required labels place first so small
        // neighbours dodge around them instead of boxing them in
        var ba = boosted[a.it.id] ? 1 : 0, bb = boosted[b.it.id] ? 1 : 0;
        return (bb - ba) || (b.it.priority || 0) - (a.it.priority || 0) ||
          (a.i - b.i);
      });

    order.forEach(function (e) {
      var it = e.it;
      var best = null;
      var bestOverlap = Infinity;
      function tryCands(cands, zeroOnly) {
        for (var c = 0; c < cands.length; c++) {
          var dx = cands[c][0], dy = cands[c][1];
          var cx = it.anchor.x + dx, cy = it.anchor.y + dy;
          var box = { // actual label box (gap applied only when colliding)
            x1: cx - it.width / 2, y1: cy - it.height / 2,
            x2: cx + it.width / 2, y2: cy + it.height / 2,
          };
          var gbox = {
            x1: box.x1 - GAP, y1: box.y1 - GAP,
            x2: box.x2 + GAP, y2: box.y2 + GAP,
          };
          if (!insideViewport(box, viewport)) continue;
          var blocked = false;
          for (var o = 0; o < obstacles.length; o++) {
            if (intersects(box, obstacles[o])) { blocked = true; break; }
          }
          if (blocked) continue;
          var ov = 0;
          for (var p = 0; p < placed.length; p++) ov += overlapArea(gbox, placed[p]);
          if (ov === 0) return { dx: dx, dy: dy, gbox: gbox, overlap: 0 };
          if (!zeroOnly && ov < bestOverlap) {
            bestOverlap = ov;
            best = { dx: dx, dy: dy, gbox: gbox, overlap: ov };
          }
        }
        return null;
      }
      var zero = tryCands(CANDS);
      if (zero) best = zero;
      // a required label that found no clean slot inside the normal grid
      // gets one bounded escape ring rather than rendering an overlap
      if ((!best || best.overlap > 0) && !it.optional) {
        zero = tryCands(CANDS_FAR, true);
        if (zero) best = zero;
      }
      if (best && best.overlap === 0) {
        placed.push(best.gbox);
        result[it.id] = { dx: best.dx, dy: best.dy, overlap: false, visible: true };
      } else if (best) {
        // hidden optional fallbacks must not reserve space they do not use
        if (!it.optional) placed.push(best.gbox);
        result[it.id] = { dx: best.dx, dy: best.dy, overlap: true, visible: !it.optional };
      } else {
        // no candidate inside viewport/clear of obstacles: a required label
        // keeps its source anchor (may clip like the original artwork) and
        // its box is STILL RESERVED so later labels do not pile on top.
        var rbox = {
          x1: it.anchor.x - it.width / 2 - GAP, y1: it.anchor.y - it.height / 2 - GAP,
          x2: it.anchor.x + it.width / 2 + GAP, y2: it.anchor.y + it.height / 2 + GAP,
        };
        if (!it.optional) placed.push(rbox);
        result[it.id] = { dx: 0, dy: 0, overlap: true, visible: !it.optional };
      }
    });
    return result;
  }

  // Greedy priority order can leave a large required label boxed in by
  // neighbours that were placed first. Repack deterministically: boost the
  // flagged required set to the front and re-run. Boosted is monotonic so
  // the flagged set converges; cap rounds to bound work. Required labels
  // are still never discarded.
  function placeLabels(items, viewport, obstacles) {
    obstacles = obstacles || [];
    var boosted = {};
    var result = runPass(items, viewport, obstacles, boosted);
    var lastKey = '';
    for (var round = 0; round < 10; round++) {
      var flagged = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var pl = result[it.id];
        if (!it.optional && pl && pl.overlap) flagged.push(it.id);
      }
      if (!flagged.length) break;
      var key = flagged.slice().sort().join('|');
      if (key === lastKey) break;
      lastKey = key;
      flagged.forEach(function (id) { boosted[id] = 1; });
      result = runPass(items, viewport, obstacles, boosted);
    }
    placeLabels.lastBoosted = boosted;
    placeLabels.lastRounds = lastKey;
    return result;
  }

  // conservative rotated AABB for a w*h box rotated `deg`, plus optional
  // curve sagitta added to height.
  function rotatedBox(w, h, deg, curve) {
    var a = (deg || 0) * Math.PI / 180;
    var ch = h + Math.abs(curve || 0) * 2;
    var cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    return { w: w * cos + ch * sin, h: w * sin + ch * cos };
  }

  // settled level-of-detail policy: lowest zoom at which a name is eligible
  // to render. major = I18N.majorTowns membership (raw key or catalog id).
  // nativeSize = the source artwork font size recorded in the catalog.
  function minZoomForLabel(kind, major, nativeSize) {
    nativeSize = nativeSize || 0;
    if (kind === 'continent' || (kind === 'water' && nativeSize >= 27)) return 1;
    if (major || kind === 'forest' || (kind === 'region' && nativeSize >= 21)) return 2;
    if (kind === 'city' || kind === 'region' ||
        (kind === 'water' && nativeSize >= 23) ||
        (kind === 'island' && nativeSize >= 20) ||
        (kind === 'mountain' && nativeSize >= 21)) return 3;
    return 4;
  }

  return {
    fontStyle: fontStyle,
    priorityFor: priorityFor,
    minZoomForLabel: minZoomForLabel,
    placeLabels: placeLabels,
    rotatedBox: rotatedBox,
    FONT_FAMILY: FONT,
    MIN_FONT: MIN,
    CAPS: CAP,
    BASE_SIZES: BASE,
  };
});
