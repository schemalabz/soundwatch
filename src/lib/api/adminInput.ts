// Request bodies for the admin's write routes, held to the convention of
// sensors/[id] PATCH: anything the route cannot apply is a 400 that says
// why — a 200 that changed nothing is not recoverable. Pure: the link dialog
// uses parseLatLon too.
export type Body = Record<string, unknown>;
export type FieldType = "boolean" | "string" | "string|null" | "number" | "object";

/** The JSON body as an object; {} for an empty body; null for anything else. */
export async function readBody(request: Request): Promise<Body | null> {
  const text = await request.text();
  if (!text.trim()) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Body) : null;
}

const fits = (v: unknown, t: FieldType): boolean =>
  t === "string|null" ? v === null || typeof v === "string"
  : t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
  : typeof v === t;

/** null when every field is known and of its type; otherwise the 400 message. */
export function checkFields(body: Body, spec: Record<string, FieldType>): string | null {
  const unknown = Object.keys(body).filter((k) => !(k in spec));
  if (unknown.length) return `Unknown field(s): ${unknown.join(", ")}`;
  for (const [k, t] of Object.entries(spec)) {
    if (k in body && !fits(body[k], t)) return `${k} must be ${t === "string|null" ? "a string or null" : `a${t === "object" ? "n" : ""} ${t}`}`;
  }
  return null;
}

/** Real coordinates, or null. 0,0 is the empty form submitted, never a store. */
export function parseLatLon(lat: unknown, lon: unknown): { latitude: number; longitude: number } | null {
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) return null;
  return { latitude: lat, longitude: lon };
}
