// Geocoding for location pins, via the Mapbox Geocoding v6 API (same token
// the map tiles already use). v6 on purpose: v5 frequently has no Greek
// translation for address features and falls back to romanized names
// ("Kapodistria Ioanni Street") — v6 with language=el returns the native
// "Καποδιστρίου Ιωάννη".

const V6 = "https://api.mapbox.com/search/geocode/v6";

interface V6Feature {
  properties: {
    name?: string;
    place_formatted?: string;
    coordinates?: { longitude: number; latitude: number };
  };
}

/** Reverse: short native address ("Πυθαγόρα 4"), or null. */
export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const url =
      `${V6}/reverse?longitude=${lng.toFixed(6)}&latitude=${lat.toFixed(6)}` +
      `&access_token=${token}&language=el&types=address,street,neighborhood,locality&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body: { features?: V6Feature[] } = await res.json();
    return body.features?.[0]?.properties.name ?? null;
  } catch {
    return null;
  }
}

export interface AddressHit {
  /** Short native label ("Ακαδημίας 30"). */
  label: string;
  /** Context line for disambiguation ("106 71 Αθήνα, Ελλάδα"). */
  context: string | null;
  lng: number;
  lat: number;
}

/** Forward autocomplete for the rail's address search — Greece, Greek,
 *  Athens-proximity-biased. */
export async function searchAddress(query: string): Promise<AddressHit[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const q = query.trim();
  if (!token || q.length < 3) return [];
  try {
    const url =
      `${V6}/forward?q=${encodeURIComponent(q)}` +
      `&access_token=${token}&language=el&country=gr&proximity=23.7275,37.9838` +
      `&types=address,street,neighborhood,locality,place&autocomplete=true&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const body: { features?: V6Feature[] } = await res.json();
    return (body.features ?? [])
      .filter((f) => f.properties.name && f.properties.coordinates)
      .map((f) => ({
        label: f.properties.name!,
        context: f.properties.place_formatted ?? null,
        lng: f.properties.coordinates!.longitude,
        lat: f.properties.coordinates!.latitude,
      }));
  } catch {
    return [];
  }
}
