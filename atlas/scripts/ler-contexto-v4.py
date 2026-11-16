"""Read a single indexed EPUB chapter locally; never publish book passages."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import zipfile

DATA = Path(__file__).resolve().parents[1] / "data"
LIBRARY = Path("D:/marcus/livros/cronicas-gelo-fogo/Livros/Epub")
INDEX = json.loads((DATA / "indice-livros-v4.json").read_text(encoding="utf-8"))


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, text):
        self.parts.append(text)

    def handle_endtag(self, tag):
        if tag in ("p", "div", "h1", "h2", "h3"):
            self.parts.append("\n")


def boundary(html, entry):
    if entry.get("unanchoredHeading"):
        marker = '<p class="Texto"><span class="Regular">Daenerys</span></p>'
        if html.count(marker) != 1:
            raise ValueError("Reviewed unanchored heading changed")
        return html.index(marker)
    if entry.get("anchor"):
        anchor = re.search(r"\bid\s*=\s*(['\"])" +
                           re.escape(entry["anchor"]) + r"\1", html)
        if not anchor:
            raise ValueError("Indexed anchor missing")
        return html.rfind("<", 0, anchor.start())
    return 0


def chapter_text(index):
    entry = INDEX["chapters"][index]
    assert entry["globalIndex"] == index
    edition = INDEX["editions"][entry["edition"]]
    with zipfile.ZipFile(LIBRARY / edition["filename"]) as archive:
        html = archive.read(entry["member"]).decode("utf-8-sig")
    start = boundary(html, entry)
    end = len(html)
    if index + 1 < len(INDEX["chapters"]):
        following = INDEX["chapters"][index + 1]
        if following["member"] == entry["member"]:
            end = boundary(html, following)
    if end <= start:
        raise ValueError("Invalid chapter boundaries")
    parser = Paragraphs()
    parser.feed(html[start:end])
    return entry, "\n".join(p.strip() for p in
                            "".join(parser.parts).splitlines() if p.strip())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("chapter", type=int, nargs="+")
    parser.add_argument("--terms", default="")
    args = parser.parse_args()
    terms = [t.casefold() for t in args.terms.split("|") if t]
    for number in args.chapter:
        entry, text = chapter_text(number)
        print(f"\n{number}: {entry['portalTitle']} / {entry['heading']}")
        print(entry["member"], entry.get("anchor"))
        paragraphs = text.splitlines()
        selected = [p for p in paragraphs if not terms or
                    any(t in p.casefold() for t in terms)]
        for paragraph in selected[:8]:
            print(paragraph[:500])
