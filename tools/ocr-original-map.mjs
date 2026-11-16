// Mechanical OCR of the author's raster label layers.
// Recipe (lead-authored, do not infer):
//  - composite labels.png / spec_labels.png RGBA over white
//  - split the 4642x4642 composite into 4 quadrants with 128px overlap
//  - Tesseract PSM 11 (sparse text), language eng, native resolution
//  - NO dictionary substitution, translation, fuzzy matching or
//    confidence thresholding - every recognition is kept raw
//  - all coordinates offset back to global 4642 space; overlap
//    duplicates are KEPT for review
// Output: reference/map-layers/labels-ocr.json, spec-labels-ocr.json
//         (+ flattened white composites labels-white.png / spec-labels-white.png)
// Run: node tools/ocr-original-map.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createWorker, PSM } from 'tesseract.js';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const SIZE = 4642;
const OVERLAP = 128;
const HALF = (SIZE + OVERLAP) / 2; // 2385 -> 2385*2 - 4642 = 128 overlap
const QUADS = [
  { name: 'NW', ox: 0, oy: 0 },
  { name: 'NE', ox: SIZE - HALF, oy: 0 },
  { name: 'SW', ox: 0, oy: SIZE - HALF },
  { name: 'SE', ox: SIZE - HALF, oy: SIZE - HALF },
];

function compositeOverWhite(png) {
  // returns a new RGB PNG buffer (opaque white behind every pixel)
  const out = Buffer.alloc(png.width * png.height * 3);
  for (let i = 0, o = 0; i < png.data.length; i += 4, o += 3) {
    const a = png.data[i + 3] / 255;
    out[o] = Math.round(png.data[i] * a + 255 * (1 - a));
    out[o + 1] = Math.round(png.data[i + 1] * a + 255 * (1 - a));
    out[o + 2] = Math.round(png.data[i + 2] * a + 255 * (1 - a));
  }
  return out;
}

function alphaGrayMask(png) {
  // flattened gray copy for OCR only (does NOT replace source colors):
  // alpha 0 -> white, alpha 255 -> black, partial -> gray. The label
  // glyphs are white-stroked, so the white composite is invisible to
  // tesseract while this mask keeps every painted pixel readable.
  const out = Buffer.alloc(png.width * png.height * 3);
  for (let i = 0, o = 0; i < png.data.length; i += 4, o += 3) {
    const g = 255 - png.data[i + 3];
    out[o] = g; out[o + 1] = g; out[o + 2] = g;
  }
  return out;
}

function cropPng(rgb, w, h, x0, y0, cw, ch) {
  const png = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * w + (x0 + x)) * 3;
      const di = (y * cw + x) * 4;
      png.data[di] = rgb[si];
      png.data[di + 1] = rgb[si + 1];
      png.data[di + 2] = rgb[si + 2];
      png.data[di + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function ocrSource(srcFile, outJson, whitePng) {
  const src = PNG.sync.read(readFileSync(srcFile));
  if (src.width !== SIZE || src.height !== SIZE) throw new Error(`${srcFile} not ${SIZE}x${SIZE}`);
  const rgb = compositeOverWhite(src);
  writeFileSync(whitePng, PNG.sync.write(
    Object.assign(new PNG({ width: SIZE, height: SIZE }), {
      data: (() => {
        const d = Buffer.alloc(SIZE * SIZE * 4);
        for (let i = 0, o = 0; o < rgb.length; i += 4, o += 3) {
          d[i] = rgb[o]; d[i + 1] = rgb[o + 1]; d[i + 2] = rgb[o + 2]; d[i + 3] = 255;
        }
        return d;
      })(),
    })
  ));

  const mask = alphaGrayMask(src);
  writeFileSync(whitePng.replace('.png', '-mask.png'), PNG.sync.write(
    Object.assign(new PNG({ width: SIZE, height: SIZE }), {
      data: (() => {
        const d = Buffer.alloc(SIZE * SIZE * 4);
        for (let i = 0, o = 0; o < mask.length; i += 4, o += 3) {
          d[i] = mask[o]; d[i + 1] = mask[o + 1]; d[i + 2] = mask[o + 2]; d[i + 3] = 255;
        }
        return d;
      })(),
    })
  ));

  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  const result = { source: srcFile, imageSize: SIZE, quadrants: [], words: [], lines: [], fullText: '' };
  for (const q of QUADS) {
    const buf = cropPng(mask, SIZE, SIZE, q.ox, q.oy, HALF, HALF);
    const { data } = await worker.recognize(buf, {}, { blocks: true });
    const quad = { ...q, w: HALF, h: HALF, blockCount: (data.blocks || []).length };
    result.quadrants.push(quad);
    let qText = '';
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const words = [];
          for (const wd of line.words || []) {
            const rec = {
              text: wd.text,
              confidence: wd.confidence,
              quad: q.name,
              x0: wd.bbox.x0 + q.ox, y0: wd.bbox.y0 + q.oy,
              x1: wd.bbox.x1 + q.ox, y1: wd.bbox.y1 + q.oy,
            };
            result.words.push(rec);
            words.push({ text: wd.text, confidence: wd.confidence, x0: rec.x0, y0: rec.y0, x1: rec.x1, y1: rec.y1 });
            qText += (qText && !qText.endsWith('\n') ? ' ' : '') + wd.text;
          }
          result.lines.push({
            text: line.text,
            confidence: line.confidence,
            quad: q.name,
            x0: line.bbox.x0 + q.ox, y0: line.bbox.y0 + q.oy,
            x1: line.bbox.x1 + q.ox, y1: line.bbox.y1 + q.oy,
            words,
          });
        }
      }
    }
    result.fullText += `\n===== ${q.name} (offset ${q.ox},${q.oy}) =====\n` + (data.text || qText);
  }
  await worker.terminate();
  writeFileSync(outJson, JSON.stringify(result, null, 1) + '\n');
  console.log(`${srcFile} -> ${outJson}: ${result.words.length} words, ${result.lines.length} lines`);
}

await ocrSource('reference/map-layers/labels.png', 'reference/map-layers/labels-ocr.json', 'reference/map-layers/labels-white.png');
await ocrSource('reference/map-layers/spec_labels.png', 'reference/map-layers/spec-labels-ocr.json', 'reference/map-layers/spec-labels-white.png');
