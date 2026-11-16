"""Freeze edition/member locators and chapter headings, never book passages."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "atlas/data"
LIBRARY = Path("D:/marcus/livros/cronicas-gelo-fogo/Livros/Epub")
DEFINITIONS = {
    "agot": ("AGOT-LEYA","9788580442786_a_guerra_dos_tronos",3,"html"),
    "acok": ("ACOK-LEYA","9788580442793_a_furia_dos_reis_cronicas_de_gelo_e_fogo",3,"html"),
    "asos": ("ASOS-LEYA","9788580444650_a_tormenta_de_espadas",5,"html"),
    "affc": ("AFFC-LEYA","9788580445053_o_festim_dos_corvos_as_cronicas_de_gelo_e_fogo_vol4",3,"xhtml"),
    "adwd": ("ADWD-LEYA","9788580445763_a_danca_dos_dragoes",5,"xhtml"),
}


class Heading(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.active = False
        self.parts = []
        self.headings = []

    def handle_starttag(self, tag, attrs):
        if tag == "p" and dict(attrs).get("id", "").startswith("toc_marker"):
            self.active = True
            self.parts = []

    def handle_data(self, text):
        if self.active:
            self.parts.append(text)

    def handle_endtag(self, tag):
        if tag == "p" and self.active:
            self.headings.append(" ".join("".join(self.parts).split()))
            self.active = False


def main():
    portal = json.loads((DATA / "portal-saga-v4-referencia.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "docs/local-book-reference.json").read_text(encoding="utf-8"))
    editions, chapters = {}, []
    for book in portal["books"]:
        edition_id, _prefix, _offset, _extension = DEFINITIONS[book["id"]]
        edition = registry["books"][edition_id]
        source = LIBRARY / edition["filename"]
        editions[edition_id] = {
            **edition, "id": edition_id, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "locatorMethod": "NCX chapter entries, including fragment anchors in shared HTML members",
        }
        with zipfile.ZipFile(source) as archive:
            toc = next(n for n in archive.namelist() if n.endswith(".ncx"))
            entries = []
            for nav in ET.fromstring(archive.read(toc)).findall(".//{*}navPoint"):
                label = nav.find("./{*}navLabel/{*}text")
                content = nav.find("./{*}content")
                if label is not None and content is not None:
                    entries.append((" ".join("".join(label.itertext()).split()),
                                    content.attrib["src"]))
            def plain(text):
                return "".join(c for c in unicodedata.normalize("NFD",text.casefold())
                               if not unicodedata.combining(c))
            begin = next(i for i,e in enumerate(entries) if plain(e[0]) == "prologo")
            if book["id"] == "adwd":
                end = next(i+1 for i in range(begin+1,len(entries))
                           if plain(entries[i][0]) == "epilogo")
            else:
                end = next(i for i in range(begin+1,len(entries))
                           if plain(entries[i][0]).startswith("apendice"))
            narrative = entries[begin:end]
            # This edition omits Daenerys I from its NCX and prints its
            # unanchored heading after Theon I in the same HTML member.
            if book["id"] == "acok":
                prefix = "9788580442793_a_furia_dos_reis_cronicas_de_gelo_e_fogo"
                narrative.insert(12,("Daenerys",f"Text/{prefix}-14.html"))
            if book["id"] == "affc":
                if plain(narrative[-1][0]) != "enquanto isso, na muralha...":
                    raise ValueError("Reviewed AFFC afterword differs")
                narrative = narrative[:-1]
            expected = book["endChapter"]-book["startChapter"]+1
            if len(narrative) != expected:
                raise ValueError(f"TOC count differs for {book['id']}: {len(narrative)} != {expected}")
            for chapter,(heading,src) in zip(
                    portal["chapters"][book["startChapter"]:book["endChapter"]+1],narrative):
                parts = src.split("#",1)
                member = str(PurePosixPath(toc).parent / parts[0])
                anchor = parts[1] if len(parts)>1 else None
                html = archive.read(member).decode("utf-8-sig")
                if anchor and f'"{anchor}"' not in html and f"'{anchor}'" not in html:
                    raise ValueError(f"TOC anchor missing in {member}: {anchor}")
                entry = {
                    "globalIndex": chapter["index"], "bookId": book["id"],
                    "localIndex": chapter["localIndex"], "edition": edition_id,
                    "member": member, "anchor": anchor, "heading": heading,
                    "portalTitle": chapter["originalTitle"],
                }
                if book["id"] == "acok" and chapter["localIndex"] == 12:
                    marker = '<p class="Texto"><span class="Regular">Daenerys</span></p>'
                    if html.count(marker) != 1:
                        raise ValueError("Reviewed unanchored Daenerys heading differs")
                    entry["unanchoredHeading"] = {"paragraphClass": "Texto",
                                                  "text": "Daenerys", "occurrence": 1}
                    entry["locatorNotice"] = "Titulo omitido do NCX e sem ancora; "
                    entry["locatorNotice"] += "apos Theon I no mesmo membro HTML, conferido diretamente."
                chapters.append(entry)
    result = {
        "policy": "Chapter-member alignment and edition provenance only. Headings are metadata, "
                  "not verification of any route, coordinate, translation or event chronology.",
        "portalSnapshotSha256": hashlib.sha256(
            (DATA / "portal-saga-v4-referencia.json").read_bytes()).hexdigest(),
        "editions": editions, "chapters": chapters,
    }
    output = DATA / "indice-livros-v4.json"
    text = json.dumps(result, ensure_ascii=True, indent=2) + "\n"
    if output.exists():
        if output.read_text(encoding="utf-8") != text:
            raise ValueError("Frozen book index differs; refusing overwrite")
    else:
        with output.open("x",encoding="utf-8") as out:
            out.write(text)
    print(output)
    for book in portal["books"]:
        items = [c for c in chapters if c["bookId"] == book["id"]]
        print(book["id"], len(items), items[0]["heading"], items[-1]["heading"])


if __name__ == "__main__":
    main()
