// Athens center coordinates
export const ATHENS_CENTER = {
  lng: 23.7275,
  lat: 37.9838,
} as const;

export const ATHENS_ZOOM = 12;

/** Mapbox wants [lng, lat]; the object form above predates it. */
export const ATHENS_CENTER_LNGLAT: [number, number] = [ATHENS_CENTER.lng, ATHENS_CENTER.lat];

/** The dashboard map opens wider than the install picker: the whole basin. */
export const ATHENS_OVERVIEW_ZOOM = 11.3;

export type NoiseLevel = "quiet" | "moderate" | "loud" | "very_loud";

export function getNoiseLevel(dba: number): NoiseLevel {
  if (dba < 55) return "quiet";
  if (dba < 65) return "moderate";
  if (dba < 75) return "loud";
  return "very_loud";
}

export function getNoiseLevelColor(dba: number): string {
  const level = getNoiseLevel(dba);
  switch (level) {
    case "quiet":
      return "#22c55e"; // green
    case "moderate":
      return "#eab308"; // yellow
    case "loud":
      return "#f97316"; // orange
    case "very_loud":
      return "#ef4444"; // red
  }
}


// Haversine — good to <0.5% at city scale, which is all the install page needs.
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
