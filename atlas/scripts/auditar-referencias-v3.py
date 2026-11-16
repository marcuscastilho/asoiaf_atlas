"""Freeze new exact-name locators; never recalculate already audited v2 terms."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SPEC = importlib.util.spec_from_file_location("audit", ROOT / "scripts/auditar-nomes-agot-v2.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def main():
    output = DATA / "nomes-inventario-v3-evidencias.json"
    if output.exists():
        raise ValueError("Frozen book-name artifact exists; read it, do not rederive")
    dataset = json.loads((DATA / "atlas-inventario-v3-candidato.json").read_text(encoding="utf-8"))
    previous = json.loads((DATA / "nomes-agot-v2-evidencias.json").read_text(encoding="utf-8"))
    frozen = {e["id"]: e for e in previous["entries"]}
    edition = previous["edition"]
    book = AUDIT.LIBRARY / edition["filename"]
    book_sha = hashlib.sha256(book.read_bytes()).hexdigest()
    if book_sha != edition["sha256"]:
        raise ValueError("Book source changed; old audit may not be combined silently")
    terms = []
    for p in dataset["controlPoints"]:
        if p["identificationStatus"] == "unidentified-symbol" or p["id"] in frozen:
            continue
        # Parenthesized map aliases are not separate entities. Search only the
        # literal primary name, without accent folding or editorial substitution.
        primary = p["label"].split(" (")[0]
        terms.append({
            "id": p["id"], "label": p["label"], "searchedTerm": primary, "locators": [],
            "pattern": re.compile(r"(?<!\w)" + re.escape(AUDIT.normalize(primary)) + r"(?!\w)"),
        })
    with zipfile.ZipFile(book) as archive:
        for member in sorted(archive.namelist()):
            if not member.lower().endswith((".html", ".xhtml", ".htm")):
                continue
            parser = AUDIT.TextOnly()
            parser.feed(archive.read(member).decode("utf-8-sig"))
            text = AUDIT.normalize("".join(parser.parts))
            for term in terms:
                if len(term["locators"]) < 3 and term["pattern"].search(text):
                    term["locators"].append({"book": "AGOT-LEYA", "epubMember": member})
    new_entries = []
    for term in terms:
        new_entries.append({
            k: v for k, v in term.items() if k != "pattern"
        } | {"status": "term-occurrence-only" if term["locators"] else
             "not-established-by-exact-search"})
    entries = [copy.deepcopy(frozen[p["id"]]) for p in dataset["controlPoints"]
               if p["id"] in frozen]
    entries += new_entries
    result = {
        "schemaVersion": 1, "datasetId": dataset["datasetId"],
        "edition": edition, "entries": entries,
        "previousFrozenAuditSha256": hashlib.sha256(
            (DATA / "nomes-agot-v2-evidencias.json").read_bytes()).hexdigest(),
        "policy": "Frozen v2 entries reused without recalculation. Only new named points "
                  "searched, literal primary name, NFC/casefold/whitespace normalization, "
                  "whole phrase, maximum three member locators. No book passages stored.",
        "limitations": previous["limitations"],
    }
    with output.open("x", encoding="utf-8") as out:
        out.write(json.dumps(result, ensure_ascii=True, indent=2) + "\n")
    print("Frozen", len(new_entries), "new name-search records; reused", len(entries)-len(new_entries))


if __name__ == "__main__":
    main()
