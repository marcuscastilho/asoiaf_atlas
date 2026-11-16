// Capture source inputs once. Rendering never reads or re-evaluates portal data.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name));
const config = JSON.parse(read("atlas/data/calibracao-agot-v2.json"));
const north = JSON.parse(read("atlas/data/piloto-norte.json"));
const context = { window: {} };
const sourceFiles = {};
for (const name of ["data", "i18n-pt"]) {
  const file = `assets/js/${name}.js`;
  const bytes = read(file);
  sourceFiles[file] = crypto.createHash("sha256").update(bytes).digest("hex");
  vm.runInNewContext(bytes.toString("utf8"), context, { filename: file });
}
const pointIds = north.controlPoints.map((p) => p.id)
  .concat(config.additionalControlPoints.map((p) => p.id));
if (new Set(pointIds).size !== pointIds.length) throw new Error("Duplicate point ID");
const snapshot = {
  datasetId: config.datasetId,
  sourceFiles,
  locations: Object.fromEntries(pointIds.map((id) => {
    const p = context.locations[id];
    if (!p) throw new Error("Unknown portal location: " + id);
    return [id, {
      lat: p.lat, lng: p.lng,
      label: context.window.GOTI18N.townName(id),
      english: id.replace(/_/g, " ").replace(/%27/g, "'"),
    }];
  })),
  chapters: north.chapters,
  characters: config.characters.map((character) => ({
    ...character,
    records: context.paths[character.id].map((record, index) => ({ index, record }))
      .filter(({ record }) => {
        const start = typeof record.chapters === "number"
          ? record.chapters : record.chapters[0];
        return start <= 72;
      }),
  })),
};
const output = path.join(root, "atlas/data/portal-agot-v2-referencia.json");
const bytes = JSON.stringify(snapshot, null, 2) + "\n";
if (fs.existsSync(output)) {
  if (fs.readFileSync(output, "utf8") !== bytes) {
    throw new Error("Frozen v2 reference differs; refusing overwrite");
  }
} else {
  fs.writeFileSync(output, bytes, { flag: "wx" });
}
console.log(output);
