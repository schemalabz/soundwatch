import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    sensor: { findUnique: vi.fn() },
    reading: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { GET as status } from "../install/[token]/status/route";

const m = vi.mocked(prisma, true);
const ctx = (token = "tok1") => ({ params: Promise.resolve({ token }) });
const SENSOR = {
  deviceId: "tok1", name: null, hardwareId: "CHIP1", apName: null,
  latitude: null, longitude: null, address: null,
  provisionedAt: null as Date | null, lastSeenAt: null,
  isExperimental: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/install/[token]/status — setup (bench check) readings", () => {
  it("only a bench-check reading 3 minutes after provisioning, 7 days ago, reads as never_seen with atSetup", async () => {
    const provisionedAt = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const receivedAt = new Date(provisionedAt.getTime() + 3 * 60 * 1000);
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, provisionedAt } as never);
    m.reading.findFirst.mockResolvedValue({
      receivedAt, laeq: 42, frameCount: 1, battery: null, rssi: null, freeHeapBytes: null, resetCause: null,
    } as never);

    const res = await status(new Request("https://x/y"), ctx());
    const body = await res.json();

    expect(body.state).toBe("never_seen");
    expect(body.live).toBe(false);
    expect(body.lastReading.atSetup).toBe(true);
  });

  it("a reading 2 days after provisioning, 1 hour ago, reads as stale with atSetup false", async () => {
    const provisionedAt = new Date(Date.now() - 2 * 24 * 3600 * 1000 - 3600 * 1000);
    const receivedAt = new Date(Date.now() - 3600 * 1000);
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, provisionedAt } as never);
    m.reading.findFirst.mockResolvedValue({
      receivedAt, laeq: 42, frameCount: 1, battery: null, rssi: null, freeHeapBytes: null, resetCause: null,
    } as never);

    const res = await status(new Request("https://x/y"), ctx());
    const body = await res.json();

    expect(body.state).toBe("stale");
    expect(body.lastReading.atSetup).toBe(false);
  });

  it("a reading 1 minute ago right after provisioning still reads as live", async () => {
    const provisionedAt = new Date(Date.now() - 65 * 1000);
    const receivedAt = new Date(Date.now() - 60 * 1000);
    m.sensor.findUnique.mockResolvedValue({ ...SENSOR, provisionedAt } as never);
    m.reading.findFirst.mockResolvedValue({
      receivedAt, laeq: 42, frameCount: 1, battery: null, rssi: null, freeHeapBytes: null, resetCause: null,
    } as never);

    const res = await status(new Request("https://x/y"), ctx());
    const body = await res.json();

    expect(body.state).toBe("live");
    expect(body.live).toBe(true);
  });
});
