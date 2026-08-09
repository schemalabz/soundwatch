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
