// Forward-geocode an address/area to coordinates via the Mapbox Geocoding API,
// biased toward Athens. Client-side; uses the public Mapbox token.
import { ATHENS_CENTER } from "@/lib/geo";

export interface GeoResult {
  lng: number;
  lat: number;
  label: string;
}

export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const q = query.trim();
  if (!token || !q) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${token}&limit=1&language=el&country=gr` +
    `&proximity=${ATHENS_CENTER.lng},${ATHENS_CENTER.lat}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f?.center) return null;
    return { lng: f.center[0], lat: f.center[1], label: f.place_name ?? q };
  } catch {
    return null;
  }
}
