"""Recodifica o tileset recorte-v1 -> recorte-v2.

Cada tile v1 carrega o ICC do scanner (~190 KB, tabelas Lab A2B).
v2: pixels convertidos ICC->sRGB (intencao perceptual), WebP lossy
q82 method=6, SEM icc/exif — mesma geometria z/x/y de 512px.
Com --qc: SSIM de amostra aleatoria v2 vs v1-convertido-sRGB.
"""
import io
import os
import random
import sys
from multiprocessing import Pool
from pathlib import Path

from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tiles" / "o-mundo-conhecido-recorte-v1"
DST = ROOT / "tiles" / "o-mundo-conhecido-recorte-v2"
PREVIA_SRC = ROOT / "assets" / "o-mundo-conhecido-recorte-v1-preview.webp"
PREVIA_DST = ROOT / "assets" / "o-mundo-conhecido-recorte-v2-preview.webp"
QUALIDADE = int(os.environ.get("TILES_Q", "82"))
METODO = 6

_SRGB = None  # lazily per process


def srgb_profile():
    global _SRGB
    if _SRGB is None:
        _SRGB = ImageCms.createProfile("sRGB")
    return _SRGB


def para_srgb(im):
    icc = im.info.get("icc_profile")
    if not icc:
        return im.convert("RGB")
    src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    return ImageCms.profileToProfile(
        im, src, srgb_profile(), outputMode="RGB",
        renderingIntent=ImageCms.Intent.PERCEPTUAL)


def converte_tile(args):
    src, dst = args
    try:
        im = Image.open(src)
        im.load()
        out = para_srgb(im)
        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst, "WEBP", quality=QUALIDADE, method=METODO)
        return (str(src), os.path.getsize(src), os.path.getsize(dst), None)
    except Exception as e:  # noqa: BLE001
        return (str(src), 0, 0, repr(e))


def converte_previa():
    im = Image.open(PREVIA_SRC)
    im.load()
    out = para_srgb(im)
    out.save(PREVIA_DST, "WEBP", quality=QUALIDADE, method=METODO)
    return (im.size, out.size, os.path.getsize(PREVIA_SRC),
            os.path.getsize(PREVIA_DST))


def main():
    tiles = sorted(SRC.glob("*/*/*.webp"))
    if not tiles:
        print("sem tiles v1", file=sys.stderr)
        return 1
    print(f"tiles v1: {len(tiles)}")
    pares = [(t, DST / t.relative_to(SRC)) for t in tiles]
    erros = []
    b_src = b_dst = 0
    with Pool() as pool:
        for i, r in enumerate(pool.imap_unordered(converte_tile, pares, 32)):
            _, s0, s1, err = r
            b_src += s0
            b_dst += s1
            if err:
                erros.append(r)
            if (i + 1) % 200 == 0:
                print(f"  {i + 1}/{len(tiles)}")
    print(f"erros: {len(erros)}")
    for e in erros[:10]:
        print("  !", e[0], e[3])
    print(f"tiles: {b_src / 1e6:.1f} MB -> {b_dst / 1e6:.1f} MB")
    try:
        p = converte_previa()
        print(f"previa: {p[0]}->{p[1]}, {p[2] / 1e6:.2f} -> {p[3] / 1e6:.2f} MB")
    except Exception as e:  # noqa: BLE001
        print("previa FALHOU:", repr(e))
        return 1
    return 1 if erros else 0


def qc(n=40):
    from skimage.metrics import structural_similarity as ssim
    import numpy as np
    tiles = sorted(DST.glob("*/*/*.webp"))
    amostra = random.Random(7).sample(tiles, min(n, len(tiles)))
    por_zoom = {}
    for t in amostra:
        v1 = Image.open(SRC / t.relative_to(DST))
        v1.load()
        ref = np.asarray(para_srgb(v1), dtype=np.float64)
        got = np.asarray(Image.open(t).convert("RGB"), dtype=np.float64)
        if ref.shape != got.shape:
            print("  shape divergente", t)
            continue
        s = ssim(ref, got, channel_axis=2, data_range=255)
        z = t.relative_to(DST).parts[0]
        por_zoom.setdefault(z, []).append((s, str(t)))
    pior = 1.0
    for z in sorted(por_zoom):
        vals = [v for v, _ in por_zoom[z]]
        pior = min(pior, min(vals))
        w = min(por_zoom[z])
        print(f"z{z}: n={len(vals)} med={sorted(vals)[len(vals) // 2]:.4f} "
              f"min={min(vals):.4f} ({Path(w[1]).name})")
    print(f"pior SSIM: {pior:.4f} (alvo >= 0.95)")
    return 0 if pior >= 0.95 else 1




def _verifica_um(t):
    """SSIM de um tile v2 vs v1->sRGB; retorna (relpath, ssim)."""
    import numpy as np
    from skimage.metrics import structural_similarity as ssim
    v1 = Image.open(SRC / t.relative_to(DST))
    v1.load()
    ref = para_srgb(v1)
    refa = np.asarray(ref, dtype=np.float64)
    got = np.asarray(Image.open(t).convert("RGB"), dtype=np.float64)
    return (str(t.relative_to(DST)),
            ssim(refa, got, channel_axis=2, data_range=255))


def _lossless_um(rel):
    t = DST / rel
    v1 = Image.open(SRC / rel)
    v1.load()
    para_srgb(v1).save(t, "WEBP", lossless=True, quality=100, method=METODO)
    return os.path.getsize(t)


def fix_ssim(limite=0.95):
    """Recodifica para lossless todo tile com SSIM < limite."""
    tiles = sorted(DST.glob("*/*/*.webp"))
    with Pool() as pool:
        res = pool.map(_verifica_um, tiles, 32)
    baixos = [rel for rel, s in res if 0 <= s < limite]
    erros = [rel for rel, s in res if s < 0]
    print(f"abaixo de {limite}: {len(baixos)}/{len(res)}; erros: {len(erros)}")
    for rel, s in sorted(res, key=lambda r: r[1])[:5]:
        print(f"  pior: {rel} {s:.3f}")
    with Pool() as pool:
        novos = pool.map(_lossless_um, baixos, 16)
    print(f"lossless reescritos: {len(novos)} "
          f"(~{sum(novos) / 1e6:.0f} MB)")
    return 1 if erros else 0

if __name__ == "__main__":
    if "--fix-ssim" in sys.argv:
        sys.exit(fix_ssim())
    if "--qc" in sys.argv:
        sys.exit(qc())
    sys.exit(main())
