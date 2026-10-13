// One figure per stage of "how it works", keyed by the stage id in
// src/lib/strings/about.ts.
import type { IsoFig } from "../runtime";
import { pressure } from "./pressure";
import { mic } from "./mic";
import { frame } from "./frame";
import { fft } from "./fft";
import { aweight } from "./aweight";
import { accumulate } from "./accumulate";
import { network } from "./network";
import { server } from "./server";
import { city } from "./city";

export const FIGS: Record<string, IsoFig> = {
  pressure,
  mic,
  frame,
  fft,
  aweight,
  accumulate,
  network,
  server,
  map: city,
};
