import { expect, it } from "vitest";
import { distanceMeters } from "./geo";

it("distanceMeters: zero for identical points", () => {
  expect(distanceMeters({ latitude: 37.98, longitude: 23.72 }, { latitude: 37.98, longitude: 23.72 })).toBe(0);
});

it("distanceMeters: known Athens pair within tolerance (Syntagma to Omonoia ≈ 1.1 km)", () => {
  const d = distanceMeters({ latitude: 37.9755, longitude: 23.7348 }, { latitude: 37.9841, longitude: 23.7281 });
  expect(d).toBeGreaterThan(1000);
  expect(d).toBeLessThan(1250);
});
