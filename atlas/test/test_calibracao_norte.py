"""Numerical and coordinate checks without changing frozen production inputs."""
import importlib.util
import math
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "calibracao", Path(__file__).resolve().parents[1] / "scripts/preparar-piloto-norte.py")
cal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cal)


class CalibrationTests(unittest.TestCase):
    def test_affine_fit_known_transform(self):
        points = [{"oldPixel": [x, y], "x": 2 * x + 3 * y + 5,
                   "y": -x + 4 * y + 7}
                  for x, y in [(0, 0), (1, 0), (0, 1), (2, 3)]]
        model = cal.fit(points)
        actual = cal.transform(model, [4, 5])
        self.assertAlmostEqual(actual[0], 28)
        self.assertAlmostEqual(actual[1], 23)

    def test_projection_inverts_existing_catalog_latlng(self):
        for x, y in [(2321, 2321), (731, 1168), (945, 759)]:
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 4642))))
            lng = x / 4642 * 360 - 180
            actual = cal.old_pixel([lat, lng])
            self.assertAlmostEqual(actual[0], x)
            self.assertAlmostEqual(actual[1], y)

    def test_degenerate_controls_refused_and_hull_detects_extrapolation(self):
        points = [{"oldPixel": [i, i], "x": i, "y": i} for i in range(4)]
        with self.assertRaisesRegex(ValueError, "Degenerate"):
            cal.fit(points)
        boundary = cal.hull([{"oldPixel": p} for p in
                             [(0, 0), (0, 2), (2, 2), (2, 0), (1, 1)]])
        edges = list(zip(boundary, boundary[1:] + boundary[:1]))
        self.assertTrue(all(cal.cross(a, b, [1, 1]) >= 0 for a, b in edges))
        self.assertTrue(any(cal.cross(a, b, [3, 1]) < 0 for a, b in edges))


if __name__ == "__main__":
    unittest.main()
