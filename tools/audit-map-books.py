"""Find explicitly authored candidate toponyms in identified local editions.

Only terms and locators are saved; book text never enters project artifacts.
An exact occurrence is evidence of spelling, not proof of entity identity.
Run from the repository with .venv-book-audit/Scripts/python.exe.
"""
import html
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
BOOK_ROOT = Path("D:/marcus/livros/cronicas-gelo-fogo/Livros")


def normalize(value):
    value = unicodedata.normalize("NFKC", value).casefold()
    value = value.replace("\u00ad", "").replace("\u00a0", " ")
    return re.sub(r"\s+", " ", value).strip()


def main():
    inventory = json.loads((ROOT / "docs/map-features.json").read_text(encoding="utf-8"))
    editorial = json.loads((ROOT / "docs/local-book-reference.json").read_text(encoding="utf-8"))
    output = ROOT / "docs/map-book-evidence.json"
    previous = json.loads(output.read_text(encoding="utf-8"))["decisions"] if output.exists() else []
    retry = set(sys.argv[1:])
    frozen = {item["id"]: item for item in previous if item["id"] not in retry}
    pending = [feature for feature in inventory["features"] if feature["id"] not in frozen]
    strict_terms = {
        term for feature in pending if feature["id"] in inventory["properCaseIds"]
        for term in feature.get("candidates", [])
    }
    ids = ["ACOK-SUMA", "AGOT-LEYA", "ACOK-LEYA", "ASOS-LEYA", "AFFC-LEYA", "ADWD-LEYA", "TWOIAF-LEYA"]
    terms = {term for feature in pending for term in feature.get("candidates", [])}
    patterns = {term: re.compile(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)") for term in terms}
    evidence = {term: {} for term in terms}

    def scan(text, book, locator):
        original = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text).replace("\u00ad", ""))
        text = normalize(text)
        for term, pattern in patterns.items():
            if term in strict_terms and not re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", original):
                continue
            if book not in evidence[term] and pattern.search(text):
                evidence[term][book] = {"book": book, **locator, "matched": term}

    for book in ids:
        metadata = editorial["books"][book]
        filename = metadata["filename"]
        path = BOOK_ROOT / ("Pdf" if filename.endswith(".pdf") else "Epub") / filename
        if filename.endswith(".pdf"):
            reader = PdfReader(str(path))
            for page, item in enumerate(reader.pages, 1):
                scan(item.extract_text() or "", book, {"pdfPage": page})
        else:
            with zipfile.ZipFile(path) as archive:
                for member in archive.namelist():
                    if not member.lower().endswith((".html", ".xhtml", ".htm")):
                        continue
                    markup = archive.read(member).decode("utf-8")
                    text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
                    scan(text, book, {"epubMember": member})
        print("scanned", book, flush=True)

    result = {
        "policy": "Exact accent-preserving, case-insensitive whole-phrase occurrence. Suma first, then identified LeYa editions. No absence claim, automatic translation, TV source or full-text storage.",
        "decisions": [],
    }
    seen = set()
    for feature in inventory["features"]:
        if not feature.get("candidates") or feature["id"] in seen:
            continue
        seen.add(feature["id"])
        if feature["id"] in frozen:
            result["decisions"].append(frozen[feature["id"]])
            continue
        candidates = feature["candidates"]
        selected = None
        for book in ids:
            for term in candidates:
                if book in evidence[term]:
                    selected = evidence[term][book]
                    break
            if selected:
                break
        result["decisions"].append({
            "id": feature["id"],
            "english": feature["english"],
            "label": selected["matched"] if selected else feature["english"],
            "status": "book-occurrence-needs-entity-review" if selected else "unconfirmed-original-retained",
            "selected": selected,
            "occurrences": [entry for term in candidates for entry in evidence[term].values()],
        })
    path = ROOT / "docs/map-book-evidence.json"
    path.write_text(json.dumps(result, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    for decision in result["decisions"]:
        print(json.dumps({key: decision[key] for key in ["id", "label", "selected"]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
