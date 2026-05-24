// Athens center coordinates
export const ATHENS_CENTER = {
  lng: 23.7275,
  lat: 37.9838,
} as const;

export const ATHENS_ZOOM = 12;

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

