"""Capture the user-specified public sheet once; dates are fan allocations."""
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = ("https://docs.google.com/spreadsheets/d/"
       "1bAquhnsIvTqAbwlNWoS33RVmz3N33e6j/export?format=csv&gid=1740264601")
OUTPUT = ROOT / "data/planilha-v3-referencia.json"


def main():
    if OUTPUT.exists():
        raise ValueError("Frozen sheet already exists; read it instead of querying again")
    with urllib.request.urlopen(URL, timeout=30) as response:
        raw = response.read()
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    expected = ["Day", "Event", "POV", "Book", "#", "Title", "References", "Date allocation", "Notes"]
    if rows.fieldnames != expected:
        raise ValueError("Unexpected sheet columns; refusing substitute interpretation")
    captured = []
    for number, row in enumerate(rows, 2):
        if row["Book"].strip() != "AGOT":
            continue
        chapter_text = row["#"].strip()
        if not chapter_text.isdigit() or not 0 <= int(chapter_text) <= 72:
            raise ValueError("Unexpected AGOT chapter value at sheet row " + str(number))
        captured.append({
            "sourceRow": number, "chapterIndex": int(chapter_text),
            "pov": row["POV"], "title": row["Title"],
            "event": row["Event"], "allocatedDay": row["Day"],
            "referenceNotes": row["References"],
            "allocationRationale": row["Date allocation"], "notes": row["Notes"],
        })
    result = {
        "sourceUrl": URL, "sheetId": "1bAquhnsIvTqAbwlNWoS33RVmz3N33e6j",
        "gid": "1740264601", "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "responseSha256": hashlib.sha256(raw).hexdigest(), "columns": expected,
        "policy": "Only AGOT chapter rows, captured once. Collaborative chronology, not "
                  "canonical dates, coordinates, road geometry or a replacement for book evidence.",
        "rows": captured,
    }
    with OUTPUT.open("x", encoding="utf-8") as out:
        out.write(json.dumps(result, ensure_ascii=True, indent=2) + "\n")
    print(OUTPUT)
    for row in captured:
        print(row["sourceRow"], row["chapterIndex"], row["pov"], row["event"])


if __name__ == "__main__":
    main()
