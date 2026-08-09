// Reverse geocoding for location-pin labels, via the Mapbox Geocoding API
// (same token the map tiles already use). Returns a short address like
// "Πυθαγόρα 4", or null when nothing resolvable comes back.

export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng.toFixed(6)},${lat.toFixed(6)}.json` +
      `?access_token=${token}&language=el&types=address,poi,neighborhood,locality&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body: { features?: { text_el?: string; text?: string; address?: string }[] } = await res.json();
    const f = body.features?.[0];
    if (!f) return null;
    const name = f.text_el ?? f.text;
    if (!name) return null;
    return f.address ? `${name} ${f.address}` : name;
  } catch {
    return null;
  }
}

export interface AddressHit {
  /** Short label ("Πυθαγόρα 4"). */
  label: string;
  /** Fuller context line for disambiguation ("Αθήνα, Αττική"). */
  context: string | null;
  lng: number;
  lat: number;
}

/** Forward geocoding for the rail's address search — Greece, Greek,
 *  Athens-proximity-biased autocomplete. */
export async function searchAddress(query: string): Promise<AddressHit[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const q = query.trim();
  if (!token || q.length < 3) return [];
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${token}&language=el&country=gr&proximity=23.7275,37.9838` +
      `&types=address,poi,neighborhood,locality,place&autocomplete=true&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const body: {
      features?: { text_el?: string; text?: string; address?: string; place_name_el?: string; place_name?: string; center: [number, number] }[];
    } = await res.json();
    return (body.features ?? []).map((f) => {
      const name = f.text_el ?? f.text ?? "";
      const label = f.address ? `${name} ${f.address}` : name;
      const full = f.place_name_el ?? f.place_name ?? "";
      const context = full.includes(",") ? full.slice(full.indexOf(",") + 1).trim() : null;
      return { label, context, lng: f.center[0], lat: f.center[1] };
    });
  } catch {
    return [];
  }
}
