// Freeze all original records once; the unpublished TWOW preview stays out of scope.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const context = { window: {} };
const sourceFiles = {};
for (const name of ["data", "i18n-pt"]) {
  const file = `assets/js/${name}.js`;
  const bytes = fs.readFileSync(path.join(root, file));
  sourceFiles[file] = crypto.createHash("sha256").update(bytes).digest("hex");
  vm.runInNewContext(bytes.toString("utf8"), context, { filename: file });
}
const definitions = [
  ["agot", "AGOT", 0, 72], ["acok", "ACOK", 73, 142],
  ["asos", "ASOS", 143, 224], ["affc", "AFFC", 225, 270],
  ["adwd", "ADWD", 271, 343],
];
const books = definitions.map(([id, code, startChapter, endChapter]) => ({
  id, code, title: context.window.GOTI18N.books[code], startChapter, endChapter,
}));
const chapters = context.chapters.slice(0, 344).map((chapter, index) => {
  const book = books.find((b) => b.startChapter <= index && index <= b.endChapter);
  const match = chapter.title.match(/^([A-Z]+)-(\d+): /);
  if (!book || !match || match[1] !== book.code ||
      Number(match[2]) !== index - book.startChapter) {
    throw new Error("Chapter sequence differs at " + index);
  }
  return {
    index, bookId: book.id, localIndex: index - book.startChapter,
    title: context.window.GOTI18N.chapterTitle(chapter.title),
    originalTitle: chapter.title,
  };
});
const snapshot = {
  datasetId: "portal-saga-v4-reference",
  sourceFiles, books, chapters,
  outOfScopeChapters: context.chapters.slice(344),
  policy: "Five published novels in publication order. AFFC and ADWD are not "
    + "synchronized. All original path records retained for audit, including "
    + "out-of-scope starts beyond343; builders must exclude those explicitly. "
    + "Old coordinates are NOT scan coordinates or literary certification.",
  locations: Object.fromEntries(Object.entries(context.locations).map(([id, p]) => [
    id, { lat: p.lat, lng: p.lng, label: context.window.GOTI18N.townName(id),
      english: id.replace(/_/g, " ").replace(/%27/g, "'") },
  ])),
  characters: Object.entries(context.paths).map(([id, records]) => ({
    id, character: context.window.GOTI18N.chars[id] || id,
    records: records.map((record, index) => ({ index, record })),
  })),
};
const output = path.join(root, "atlas/data/portal-saga-v4-referencia.json");
const bytes = JSON.stringify(snapshot, null, 2) + "\n";
if (fs.existsSync(output)) {
  if (fs.readFileSync(output, "utf8") !== bytes) {
    throw new Error("Frozen saga reference differs; refusing overwrite");
  }
} else {
  fs.writeFileSync(output, bytes, { flag: "wx" });
}
console.log(output);
