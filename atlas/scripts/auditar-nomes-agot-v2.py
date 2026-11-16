"""Record exact name occurrences, not passages or route/translation certification."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = Path("D:/marcus/livros/cronicas-gelo-fogo/Livros/Epub")


def normalize(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip().casefold()


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.suppressed += 1
        if not self.suppressed and tag in ("p", "div", "br", "li", "h1", "h2", "h3"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.suppressed = max(0, self.suppressed - 1)
        if not self.suppressed and tag in ("p", "div", "li", "h1", "h2", "h3"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(data)


def main():
    output = ROOT / "atlas/data/nomes-agot-v2-evidencias.json"
    if output.exists():
        raise ValueError("Frozen book audit already exists; read it instead of rederiving")
    dataset_path = ROOT / "atlas/data/atlas-agot-v2.json"
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "docs/local-book-reference.json").read_text(encoding="utf-8"))
    edition = registry["books"]["AGOT-LEYA"]
    book = LIBRARY / edition["filename"]
    book_hash = hashlib.sha256(book.read_bytes()).hexdigest()
    terms = [{
        "id": p["id"], "label": p["label"], "locators": [],
        "pattern": re.compile(r"(?<!\w)" + re.escape(normalize(p["label"])) + r"(?!\w)"),
    } for p in dataset["controlPoints"]]
    with zipfile.ZipFile(book) as archive:
        for member in sorted(archive.namelist()):
            if not member.lower().endswith((".html", ".xhtml", ".htm")):
                continue
            parser = TextOnly()
            parser.feed(archive.read(member).decode("utf-8-sig"))
            text = normalize("".join(parser.parts))
            for term in terms:
                if len(term["locators"]) < 3 and term["pattern"].search(text):
                    term["locators"].append({"book": "AGOT-LEYA", "epubMember": member})
    entries = [{
        "id": term["id"], "label": term["label"],
        "status": "term-occurrence-only" if term["locators"] else "not-established-by-exact-search",
        "locators": term["locators"],
    } for term in terms]
    result = {
        "schemaVersion": 1, "datasetId": dataset["datasetId"],
        "datasetSha256": hashlib.sha256(dataset_path.read_bytes()).hexdigest(),
        "edition": {"id": "AGOT-LEYA", **edition, "sha256": book_hash},
        "policy": "Exact accent-preserving whole-phrase, case-insensitive occurrence after "
                  "NFC and whitespace normalization. At most three member locators per term, "
                  "not occurrence counts. Names may occur in maps or appendices. No passages stored.",
        "limitations": [
            "Ocorrencia de um nome nao certifica entidade, coordenadas, caminho ou cronologia.",
            "Este registro e exclusivo da edicao LeYa identificada; nao confirma a forma Suma.",
            "Busca sem resultado nao prova ausencia no livro nem erro de traducao.",
            "Nenhuma passagem dos livros foi copiada para este arquivo.",
        ],
        "entries": entries,
    }
    with output.open("x", encoding="utf-8") as out:
        out.write(json.dumps(result, ensure_ascii=True, indent=2) + "\n")
    print(output)
    for entry in entries:
        print(entry["id"], entry["status"], entry["locators"][:1])


if __name__ == "__main__":
    main()
