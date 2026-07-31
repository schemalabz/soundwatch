"""
Give the 50 mock sensors a location INSIDE the Athens municipality + a current
value per map layer.

Positions are rejection-sampled inside the real Δήμος Αθηναίων border
(src/lib/athensBorder.json, pulled from the opencouncil DB) so every sensor sits
within the municipality. Layer values come from fullSensorMock.json:
  - noiseDba   -> noise heatmap (color)   + noisePeak/spread -> spread
  - pm25       -> air-quality heatmap
  - uvIndex    -> UV circles

Stdlib only. Deterministic (seeded).

Usage:
  python generate_sensor_geo.py --mock ../../src/lib/fullSensorMock.json \
      --border ../../src/lib/athensBorder.json --out ../../src/lib/sensorsGeo.json
"""
import argparse
import json
import random
from statistics import mean

AREAS = ["Σύνταγμα", "Εξάρχεια", "Κολωνάκι", "Πλάκα", "Κυψέλη", "Παγκράτι", "Αμπελόκηποι",
         "Πετράλωνα", "Γκάζι", "Νέος Κόσμος", "Κουκάκι", "Θησείο", "Μεταξουργείο",
         "Γουδή", "Ιλίσια", "Ζωγράφου", "Καισαριανή", "Βύρωνας", "Γαλάτσι", "Πατήσια"]


def _point_in_ring(x, y, ring):
    """Ray-casting: is (x,y) inside this ring of [lng,lat] points?"""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_multipolygon(x, y, polygons):
    """polygons: MultiPolygon coords = [ [outer, hole...], ... ]."""
    for poly in polygons:
        if _point_in_ring(x, y, poly[0]) and not any(_point_in_ring(x, y, h) for h in poly[1:]):
            return True
    return False


def bbox_of(polygons):
    xs = [pt[0] for poly in polygons for ring in poly for pt in ring]
    ys = [pt[1] for poly in polygons for ring in poly for pt in ring]
    return min(xs), min(ys), max(xs), max(ys)


def sample_inside(rng, polygons, bbox):
    minx, miny, maxx, maxy = bbox
    for _ in range(20000):
        x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if point_in_multipolygon(x, y, polygons):
            return round(x, 5), round(y, 5)
    raise RuntimeError("could not sample a point inside the municipality")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", default="../../src/lib/fullSensorMock.json")
    ap.add_argument("--border", default="../../src/lib/athensBorder.json")
    ap.add_argument("--out", default="../../src/lib/sensorsGeo.json")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    border = json.load(open(args.border))
    geom = border["geometry"]
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    bbox = bbox_of(polygons)
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2

    data = json.load(open(args.mock))
    by_sensor = {}
    for r in data["readings"]:
        by_sensor.setdefault(r["sensorId"], []).append(r)

    rng = random.Random(args.seed)
    sensors = []
    for i, sid in enumerate(sorted(by_sensor)):
        rows = by_sensor[sid]
        lng, lat = sample_inside(rng, polygons, bbox)
        bias = rng.uniform(-9, 11)  # per-area loudness bias (uniform audio pool otherwise)
        sensors.append({
            "id": sid,
            "name": AREAS[i % len(AREAS)],
            "lng": lng, "lat": lat,
            "noiseDba": round(mean(r["noiseDba"] for r in rows) + bias, 1),
            "noisePeak": round(max(r["noiseDba"] for r in rows) + bias, 1),
            "pm25": round(mean(r["pm25"] for r in rows), 1),
            "uvIndex": round(mean(r["uvA"] + r["uvB"] + r["uvC"] for r in rows), 3),
        })

    peaks = [s["noisePeak"] for s in sensors]
    lo, hi = min(peaks), max(peaks)
    for s in sensors:
        s["spread"] = round((s["noisePeak"] - lo) / (hi - lo + 1e-9), 3)

    out = {"center": {"lng": round(cx, 5), "lat": round(cy, 5)}, "sensors": sensors}
    json.dump(out, open(args.out, "w"), ensure_ascii=False, indent=2)
    print(f"wrote {len(sensors)} sensors inside the municipality -> {args.out}")


if __name__ == "__main__":
    main()
