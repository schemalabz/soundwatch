// One figure per stage of "how it works", keyed by the stage id in
// src/lib/strings/about.ts.
import type { IsoFig } from "../runtime";
import { pressure } from "./pressure";
import { mic } from "./mic";
import { frame } from "./frame";
import { aweight } from "./aweight";
import { accumulate } from "./accumulate";
import { city } from "./city";

export const FIGS: Record<string, IsoFig> = {
  pressure,
  mic,
  frame,
  aweight,
  accumulate,
  map: city,
};
