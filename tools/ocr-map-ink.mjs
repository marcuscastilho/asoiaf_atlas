// Raw OCR aid, never an authoritative place-name catalog.
// Isolate dark label ink from the pale outline, enlarge 2x, retain all results.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { createWorker, PSM } from 'tesseract.js';

const size = 4642;
const span = 2385;
const scale = 2;
const quadrants = [
  { name: 'NW', x: 0, y: 0 },
  { name: 'NE', x: size - span, y: 0 },
  { name: 'SW', x: 0, y: size - span },
  { name: 'SE', x: size - span, y: size - span },
];
const worker = await createWorker('eng');
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
for (const source of ['labels', 'spec_labels']) {
  const image = PNG.sync.read(readFileSync(`reference/map-layers/${source}.png`));
  const result = { source, recipe: 'dark-ink-2x-psm11', lines: [], words: [], text: '' };
  for (const quad of quadrants) {
    const crop = new PNG({ width: span * scale, height: span * scale });
    for (let y = 0; y < crop.height; y++) {
      for (let x = 0; x < crop.width; x++) {
        const p = ((quad.y + Math.floor(y / scale)) * size + quad.x + Math.floor(x / scale)) * 4;
        const dark = image.data[p + 3] >= 64 &&
          Math.max(image.data[p], image.data[p + 1], image.data[p + 2]) < 205;
        const out = (y * crop.width + x) * 4;
        crop.data[out] = crop.data[out + 1] = crop.data[out + 2] = dark ? 0 : 255;
        crop.data[out + 3] = 255;
      }
    }
    const { data } = await worker.recognize(PNG.sync.write(crop), {}, { blocks: true });
    const convert = (item) => ({
      text: item.text,
      confidence: item.confidence,
      quad: quad.name,
      x0: quad.x + item.bbox.x0 / scale,
      y0: quad.y + item.bbox.y0 / scale,
      x1: quad.x + item.bbox.x1 / scale,
      y1: quad.y + item.bbox.y1 / scale,
    });
    result.text += `\n=== ${quad.name} ===\n${data.text}`;
    for (const block of data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          result.lines.push(convert(line));
          for (const word of line.words || []) result.words.push(convert(word));
        }
      }
    }
    console.log(source, quad.name, 'complete');
  }
  writeFileSync(`reference/map-layers/${source}-ink-ocr.json`, JSON.stringify(result, null, 2));
}
await worker.terminate();
