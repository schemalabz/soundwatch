// Inventory: physical boxes, not tokens. A box is its chip id (hardware_id);
// re-provisioning mints a new token for the same chip, so one box can own
// several sensor rows over its life. Pure — the inventory route feeds it rows.

export interface TokenRow {
  id: string;
  deviceId: string;
  hardwareId: string | null;
  createdAt: Date;
  retiredAt: Date | null;
  isActive: boolean;
  isExperimental: boolean;
}

export interface Box<T extends TokenRow> {
  /** The chip id, or `token:<deviceId>` for a row that never reported one. */
  key: string;
  hardwareId: string | null;
  /** The token in use: newest not retired (else newest). */
  current: T;
  /** Older tokens for the same chip, newest first. */
  previous: T[];
  /** Older tokens still active — the phantom rows to retire. */
  duplicates: T[];
}

/** Group token rows into boxes by chip id. */
export function groupBoxes<T extends TokenRow>(rows: T[]): Box<T>[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.hardwareId ?? `token:${r.deviceId}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const boxes: Box<T>[] = [];
  for (const [key, g] of groups) {
    const byNewest = [...g].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const current = byNewest.find((r) => !r.retiredAt && r.isActive) ?? byNewest[0];
    const previous = byNewest.filter((r) => r !== current);
    boxes.push({
      key,
      hardwareId: g[0].hardwareId,
      current,
      previous,
      duplicates: previous.filter((r) => !r.retiredAt && r.isActive),
    });
  }
  return boxes;
}

