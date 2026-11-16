// Freeze the exact existing portal inputs once; never run during navigation.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const context = { window: {} };
const sources = {};
for (const name of ["data", "i18n-pt"]) {
  const file = "assets/js/" + name + ".js";
  const bytes = fs.readFileSync(path.join(root, file));
  sources[file] = crypto.createHash("sha256").update(bytes).digest("hex");
  vm.runInNewContext(bytes.toString("utf8"), context, { filename: file });
}
const config = JSON.parse(fs.readFileSync(path.join(root, "atlas/data/calibracao-norte.json")));
const snapshot = {
  sourceFiles: sources,
  locations: Object.fromEntries(config.controlPoints.map(({ id }) => {
    if (!context.locations[id]) throw new Error("Unknown location: " + id);
    return [id, {
      ...context.locations[id],
      label: context.window.GOTI18N.townName(id),
      english: id.replace(/_/g, " "),
    }];
  })),
  chapters: context.chapters.map((chapter, index) => ({
    index, title: context.window.GOTI18N.chapterTitle(chapter.title),
    originalTitle: chapter.title,
  })).filter((chapter) => chapter.originalTitle.startsWith("AGOT-")),
  jonRecords: [0, 3, 4, 5].map((index) => ({
    index, record: context.paths.jon[index],
  })),
};
if (snapshot.chapters.length !== 73 || snapshot.chapters[19].originalTitle !== "AGOT-19: Jon III") {
  throw new Error("Unexpected chapter sequence");
}
const output = path.join(root, "atlas/data/portal-norte-referencia.json");
const bytes = JSON.stringify(snapshot, null, 2) + "\n";
if (fs.existsSync(output)) {
  if (fs.readFileSync(output, "utf8") !== bytes) {
    throw new Error("Frozen portal reference differs; refusing overwrite");
  }
} else {
  fs.writeFileSync(output, bytes, { flag: "wx" });
}
console.log(output);
