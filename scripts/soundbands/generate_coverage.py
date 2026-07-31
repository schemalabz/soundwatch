"""
Realistic, road-following noise coverage per sensor (instead of plain circles).

For each sensor we call the Mapbox Isochrone API (walking profile), which returns
the area reachable ALONG THE STREET NETWORK from that point — an organic, road-
shaped polygon, not a circle. The contour distance scales with the sensor's noise
(louder -> larger coverage). Output: a GeoJSON FeatureCollection with a `noise`
property per polygon, for a fill layer on the map.

Usage:
  python generate_coverage.py               # reads token from ../../.env
Requires: stdlib only (urllib). Deterministic order.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(__file__)
ENV = os.path.join(HERE, "../../.env")
SENSORS = os.path.join(HERE, "../../src/lib/sensorsGeo.json")
OUT = os.path.join(HERE, "../../src/lib/sensorCoverage.json")

MIN_M, MAX_M = 200, 700   # coverage distance range (metres along roads)


def token():
    for line in open(ENV, encoding="utf-8"):
        m = re.match(r'\s*NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN\s*=\s*["\']?([^"\'\s]+)', line)
        if m:
            return m.group(1)
    raise SystemExit("token not found in .env")


def isochrone(tok, lng, lat, meters):
    q = urllib.parse.urlencode({"contours_meters": meters, "polygons": "true", "access_token": tok})
    url = f"https://api.mapbox.com/isochrone/v1/mapbox/walking/{lng},{lat}?{q}"
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    feats = data.get("features") or []
    return feats[0]["geometry"] if feats else None


def main():
    tok = token()
    sensors = json.load(open(SENSORS, encoding="utf-8"))["sensors"]
    ns = [s["noiseDba"] for s in sensors]
    lo, hi = min(ns), max(ns)

    features = []
    for i, s in enumerate(sensors):
        frac = (s["noiseDba"] - lo) / (hi - lo + 1e-9)          # 0..1 by loudness
        meters = round(MIN_M + frac * (MAX_M - MIN_M))
        try:
            geom = isochrone(tok, s["lng"], s["lat"], meters)
        except Exception as e:  # noqa: BLE001
            print("skip", s["id"], e); geom = None
        if not geom:
            continue
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {"id": s["id"], "noise": s["noiseDba"], "meters": meters},
        })
        print(f"{s['id']}: {s['noiseDba']} dBA -> {meters} m ({len(features)}/{len(sensors)})")
        time.sleep(0.15)  # stay well under the rate limit

    json.dump({"type": "FeatureCollection", "features": features},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\nwrote {len(features)} coverage polygons -> {OUT}")


if __name__ == "__main__":
    main()
