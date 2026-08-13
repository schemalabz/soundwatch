import { z } from "zod";
import {
  ErrorSchema,
  ReadingsResponseSchema,
  READINGS_QUERY_PARAMETERS,
  SensorDetailSchema,
  SensorListItemSchema,
} from "./schemas";

// The document is built from the same zod objects the routes validate and type
// against, so it cannot drift from the code. Field-level caveats live in the
// schemas' .describe() strings — this file only assembles paths.

const json = (schema: z.ZodType) => ({
  "application/json": { schema: z.toJSONSchema(schema) },
});

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Sensor id (uuid).",
} as const;

const notFound = {
  description:
    "Sensor not found (includes bench/experimental units, which are not public).",
  content: json(ErrorSchema),
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Soundwatch API",
      version: "1.0.0",
      description:
        "Live noise measurements from the Soundwatch Athens sensor network.\n\n" +
        "**Every level in this API is uncalibrated device-dB, NOT dB(A).** No " +
        "absolute calibration has ever been applied; the zero point is " +
        "arbitrary. Levels support comparisons within one unit over time " +
        "(the strongest claim available) and, with ~1.8 dB of spread, between " +
        "units. They do not support comparison against regulatory limits or " +
        "other instruments.\n\n" +
        "The authoritative definition of every field is the measurement " +
        "contract: `docs/soundwatch/measurement-contract.md` in the " +
        "`soundwatch-firmware` repository.",
    },
    paths: {
      "/api/sensors": {
        get: {
          summary: "List public sensors with their latest reading",
          description:
            "Bench/experimental units are excluded. `includeExperimental=1` " +
            "with an admin bearer token includes them; for anyone else the " +
            "parameter is ignored.",
          responses: {
            "200": {
              description: "Public sensors, name-ordered.",
              content: json(z.array(SensorListItemSchema)),
            },
          },
        },
      },
      "/api/sensors/{id}": {
        get: {
          summary: "One sensor with its latest reading",
          parameters: [idParam],
          responses: {
            "200": {
              description: "The sensor.",
              content: json(SensorDetailSchema),
            },
            "404": notFound,
          },
        },
      },
      "/api/sensors/{id}/readings": {
        get: {
          summary: "Readings for one sensor",
          description:
            "Newest first by receivedAt (server insert time). `from`/`to` " +
            "filter on recordedAt — the device clock — which can run up to " +
            "~35 minutes ahead of real time.",
          parameters: [idParam, ...READINGS_QUERY_PARAMETERS],
          responses: {
            "200": {
              description: "Readings, newest first by receivedAt.",
              content: json(ReadingsResponseSchema),
            },
            "400": {
              description: "Invalid query.",
              content: json(ErrorSchema),
            },
            "404": notFound,
          },
        },
      },
    },
  };
}
