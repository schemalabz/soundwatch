// The admin's "now". In development, ADMIN_NOW pins it so a restored
// production snapshot can be reviewed as of the moment it was taken —
// otherwise every unit in a day-old dump reads as silent. Ignored in
// production builds, where "now" is always the real clock.
export function adminNow(): Date {
  const pinned = process.env.ADMIN_NOW;
  if (pinned && process.env.NODE_ENV !== "production") {
    const d = new Date(pinned);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
