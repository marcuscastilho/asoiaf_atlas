// Pure helper logic shared by app.js and the Node unit tests.
// No DOM, no map engine - safe to require() from node:test.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GOTCORE = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // --- keyhole tile naming (verbatim port of the original getTileCode) ---
  // root 't'; per zoom level one quadrant letter: q=NW r=NE t=SW s=SE
  function getTileCode(x, y, zoom) {
    var code = 't';
    var size = Math.pow(2, zoom);
    for (var i = 0; i < zoom; i++) {
      size = size / 2;
      if (y < size) {
        if (x < size) code += 'q';
        else { code += 'r'; x -= size; }
      } else {
        if (x < size) { code += 't'; y -= size; }
        else { code += 's'; x -= size; y -= size; }
      }
    }
    return code;
  }

  function isOutsideTileRange(x, y, zoom) {
    var tileRange = 1 << zoom;
    return x < 0 || x >= tileRange || y < 0 || y >= tileRange;
  }

  function tileUrl(layer, x, y, zoom) {
    if (isOutsideTileRange(x, y, zoom)) return null;
    return 'assets/tiles/' + layer + '/' + getTileCode(x, y, zoom) + '.jpg';
  }

  function clamp(v, lo, hi) {
    v = Number(v);
    if (isNaN(v)) return lo;
    return v < lo ? lo : v > hi ? hi : v;
  }

  // --- spoiler ranges (port of original chapters/episodes parsing) ---
  // scalar n  -> [n, defEnd]      (cumulative: stays visible from n onward)
  // [a,b]     -> [a,b]            (inclusive range)
  // missing   -> [defStart, defEnd]
  function spoilerRange(value, defStart, defEnd) {
    var range = [defStart, defEnd];
    if (typeof value === 'number') range[0] = value;
    if (typeof value === 'object' && value != null) {
      if (value.length === 2 && typeof value[1] === 'number') range[1] = value[1];
      if (typeof value[0] === 'number') range[0] = value[0];
    }
    return range;
  }

  // Path overlays (markers/lines/arrows) default to "never" when a mode is
  // unspecified - preserving the original's [999,999] / [99,99] defaults.
  function pathRanges(opt) {
    return {
      chapters: spoilerRange(opt.chapters, 999, 999),
      episodes: spoilerRange(opt.episodes, 99, 99),
    };
  }

  // Nobility (houses) default to "always" - the original used [0,999].
  function nobilityRanges(opt) {
    return {
      chapters: spoilerRange(opt.chapters, 0, 999),
      episodes: spoilerRange(opt.episodes, 0, 999),
    };
  }

  function inRange(range, index) {
    return range[0] <= index && index <= range[1];
  }

  // A path overlay is visible when in range for the active mode; marker-only
  // mode shows markers only (fixes the original bug: lines AND arrows hide).
  function pathOverlayVisible(ranges, kind, mode, index, markerOnly) {
    var range = mode === 'C' ? ranges.chapters : ranges.episodes;
    if (!inRange(range, index)) return false;
    if (markerOnly && kind !== 'marker') return false;
    return true;
  }

  // --- text normalization / search ---
  function normalizeText(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function searchMatches(filterText, query) {
    var q = normalizeText(query).trim();
    if (!q) return false;
    return normalizeText(filterText).indexOf(q) !== -1;
  }

  // --- location keys ---------------------------------------------------
  // keys look like "King%27s_Landing" -> display "King's Landing"
  function decodeLocationKey(key) {
    return String(key).replace(/_/g, ' ').replace(/%27/gi, "'");
  }
  function encodeDisplayName(name) {
    return String(name).replace(/ /g, '_').replace(/'/g, '%27');
  }

  // --- URL hash  (#@King%27s_Landing | #@10.5,-80.3) --------------------
  function parseHash(href) {
    var s = String(href == null ? '' : href);
    var i = s.indexOf('#@');
    if (i === -1) return { kind: 'none' };
    var frag = s.slice(i + 2);
    var amp = frag.indexOf('&');
    if (amp !== -1) frag = frag.slice(0, amp);
    if (!frag) return { kind: 'none' };
    var m = frag.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (m) {
      var lat = parseFloat(m[1]);
      var lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 85 && Math.abs(lng) <= 180) {
        return { kind: 'coords', lat: lat, lng: lng };
      }
      return { kind: 'none' };
    }
    if (/^[-\d.,\s]+$/.test(frag)) return { kind: 'none' }; // malformed coords
    return { kind: 'key', key: frag };
  }

  // --- character pin spec: "_sleft|E|808080" | "|D|000000|FFFFFF" | "skull" | "lost"
  function parsePinSpec(icon) {
    if (typeof icon !== 'string') return null;
    if (icon === 'skull' || icon === 'lost') return { kind: icon };
    var side = null;
    var rest = icon;
    if (rest.slice(0, 3) === '_sl') { side = 'left'; rest = rest.slice(6); }
    else if (rest.slice(0, 3) === '_sr') { side = 'right'; rest = rest.slice(7); }
    var parts = rest.split('|');
    // expected "|L|RRGGBB" or "|L|RRGGBB|TTTTTT"
    var letter = parts[1] || '';
    var fill = parts[2] ? '#' + parts[2] : '#808080';
    var textColor = parts[3] ? '#' + parts[3] : '#FFFFFF';
    return { kind: 'pin', side: side, letter: letter, fill: fill, textColor: textColor };
  }

  return {
    getTileCode: getTileCode,
    isOutsideTileRange: isOutsideTileRange,
    tileUrl: tileUrl,
    clamp: clamp,
    spoilerRange: spoilerRange,
    pathRanges: pathRanges,
    nobilityRanges: nobilityRanges,
    inRange: inRange,
    pathOverlayVisible: pathOverlayVisible,
    normalizeText: normalizeText,
    searchMatches: searchMatches,
    decodeLocationKey: decodeLocationKey,
    encodeDisplayName: encodeDisplayName,
    parseHash: parseHash,
    parsePinSpec: parsePinSpec,
  };
});
