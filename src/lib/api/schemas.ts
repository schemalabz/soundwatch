import { z } from "zod";

// Every description below is rendered into the generated OpenAPI document —
// the caveats live next to the fields, not only in prose. The authoritative
// definition of every number is
// soundwatch-firmware/docs/soundwatch/measurement-contract.md; descriptions
// summarise, that document decides.

const NOT_DBA =
  "UNCALIBRATED device-dB — NOT dB(A). The zero point is arbitrary (no absolute " +
  "reference has ever been applied). Valid for comparisons within one unit over " +
  "time; unit-to-unit spread is ~1.8 dB. Never compare to a regulatory limit or " +
  "another instrument.";

const PERCENTILE_COMMON =
  `${NOT_DBA} Interpolated from a 30-bin histogram clamped to 30-90 device-dB. ` +
  "Do not average percentiles across intervals — sum the histogram counts and " +
  "recompute instead.";

export const ReadingSchema = z.object({
  recordedAt: z
    .string()
    .describe(
      "Device clock — when the sound happened. Runs up to ~35 min ahead of real " +
        "time and jumps backwards on NTP resync. Usable as a chart x-axis; never " +
        "use it for ordering or sequencing."
    ),
  receivedAt: z
    .string()
    .describe("Server insert time. Use this for ordering and pagination."),
  laeq: z
    .number()
    .nullable()
    .describe(
      `Interval average level (energy mean over all captured frames). ${NOT_DBA} ` +
        "For payloadVersion < 4, values above ~65 are a lower bound (pre-fix level " +
        "clamp). If energySaturations > 0, this value is a lower bound."
    ),
  l10: z
    .number()
    .nullable()
    .describe(
      `Level exceeded 10% of the interval. ${PERCENTILE_COMMON} MAY BE CENSORED: ` +
        "a value at or above 88 landed in the open-ended top bin and is a FLOOR, " +
        "not a value — the true level can be 12+ dB higher, so render '>= 88'. " +
        "Check topBinCensored: when it is true but this value is below 88, l10 " +
        "itself is sound and only the interval's upper tail (lmaxEst) is bounded."
    ),
  l50: z
    .number()
    .nullable()
    .describe(`Median level of the interval. ${PERCENTILE_COMMON}`),
  l90: z
    .number()
    .nullable()
    .describe(
      `Level exceeded 90% of the interval (background). ${PERCENTILE_COMMON} When ` +
        "bottomBinCensored is true the true value may be below the histogram's " +
        "32 dB floor — treat values at or below 32 as a ceiling."
    ),
  topBinCensored: z
    .boolean()
    .nullable()
    .describe(
      "True when ANY frame in this interval landed in the histogram's open-ended " +
        "top bin [88, inf) device-dB, so the interval's loud tail is bounded and " +
        "lmaxEst is a lower bound. It does NOT by itself mean l10 is censored: " +
        "l10 is only censored when it reads 88 or above (a percentile landing in " +
        "that bin can only return 88-90 whatever the true level). Measured over " +
        "7 days of fleet data, every pinned l10 had this flag set, and it was " +
        "additionally set on ~2.4% of intervals whose l10 was fine. Null when " +
        "the interval has no histogram."
    ),
  bottomBinCensored: z
    .boolean()
    .nullable()
    .describe(
      "True when frames landed in the histogram's open-ended bottom bin below " +
        "32 device-dB, so quiet percentiles are ceilings. Null when the interval " +
        "has no histogram."
    ),
  lmaxEst: z
    .number()
    .nullable()
    .describe(
      `Loudest single 11.6 ms frame. ${NOT_DBA} NOT a standards 'Fast' (125 ms) ` +
        "maximum — it overstates Fast by 2.3-4.7 dB (measured). Do not present " +
        "as a peak without saying so."
    ),
  lminEst: z
    .number()
    .nullable()
    .describe(`Quietest single 11.6 ms frame. ${NOT_DBA}`),
  hist: z
    .array(z.number().int())
    .nullable()
    .describe(
      "30 frame counts per 2 dB bin; bin i covers [30+2i, 32+2i) device-dB. " +
        "Bins 0 and 29 are open-ended (<= 32 and >= 88). To aggregate percentiles " +
        "across intervals, sum these counts and recompute."
    ),
  bandsDb: z
    .array(z.number().nullable())
    .nullable()
    .describe(
      "21 frequency bands in device-dB: LOW (86-258 Hz) then third-octaves " +
        "250 Hz-20 kHz. UNWEIGHTED, unlike laeq and the percentiles which are " +
        "A-weighted — never plot a band against laeq. The top bands sit largely " +
        "at the sensor's own noise floor. A null slot means no energy recorded. " +
        "Bands can saturate silently (no counter)."
    ),
  realizedDuty: z
    .number()
    .nullable()
    .describe(
      "Fraction of the interval actually listened to; ~0.33 is the hardware " +
        "ceiling, the fleet runs ~0.32. Duty does NOT bias laeq (measured " +
        "corr ~ 0.02); low duty only raises the chance a short event was missed. " +
        "Not a data-quality score."
    ),
  frameCount: z
    .number()
    .int()
    .nullable()
    .describe("Frames captured and analysed this interval (11.61 ms each)."),
  intervalMs: z
    .number()
    .int()
    .nullable()
    .describe(
      "Measured elapsed accumulation window in ms (payloadVersion >= 3), not the " +
        "configured interval."
    ),
  intervalS: z
    .number()
    .int()
    .nullable()
    .describe("Legacy interval in seconds (rows with payloadVersion < 3 only)."),
  payloadVersion: z
    .number()
    .int()
    .nullable()
    .describe(
      "Firmware payload version — consumers must branch on it. 3 = interval " +
        "reported in ms; 4 = level-linearity fix applied. Every reading with " +
        "version < 4 is a lower bound above ~65 device-dB."
    ),
  energySaturations: z
    .number()
    .int()
    .nullable()
    .describe(
      "Times the device's energy accumulator clamped this interval. Non-zero " +
        "means laeq is a lower bound. Null means firmware too old to report — " +
        "NOT the same as zero."
    ),
  noiseDba: z
    .number()
    .nullable()
    .meta({ deprecated: true })
    .describe(
      "DEPRECATED — despite the name this is NOT dB(A). Under Soundwatch " +
        "firmware it is laeq (uncalibrated device-dB); on legacy rows it is the " +
        "stock firmware's own unvalidated estimate. Use laeq. Kept only for " +
        "existing consumers."
    ),
  temperature: z.number().nullable().describe("Air temperature, °C."),
  humidity: z.number().nullable().describe("Relative humidity, %."),
  lightLux: z.number().nullable().describe("Illuminance, lux."),
  pressurePa: z.number().nullable().describe("Barometric pressure, Pa."),
  uvA: z.number().nullable(),
  uvB: z.number().nullable(),
  uvC: z.number().nullable(),
  pm1: z.number().nullable().describe("PM1.0, ug/m3 (sparse: ~10% of rows)."),
  pm25: z.number().nullable().describe("PM2.5, ug/m3 (sparse: ~10% of rows)."),
  pm4: z.number().nullable().describe("PM4.0, ug/m3 (sparse: ~10% of rows)."),
  pm10: z.number().nullable().describe("PM10, ug/m3 (sparse: ~10% of rows)."),
  pn05: z.number().nullable(),
  pn10: z.number().nullable(),
  pn25: z.number().nullable(),
  pn40: z.number().nullable(),
  pn100: z.number().nullable(),
  tps: z.number().nullable().describe("Typical particle size, um."),
  battery: z.number().nullable().describe("Battery, %."),
  rssi: z.number().nullable().describe("WiFi RSSI, dBm."),
  sdCard: z.number().nullable().describe("SD card present (1) or not (0)."),
});

export type ApiReading = z.infer<typeof ReadingSchema>;

const isParsableDate = (s: string) => !Number.isNaN(Date.parse(s));

export const ReadingsQuerySchema = z.object({
  from: z.string().refine(isParsableDate, "not a parsable date").optional(),
  to: z.string().refine(isParsableDate, "not a parsable date").optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "must be a positive integer")
    .transform(Number)
    .refine((n) => n >= 1 && n <= 10000, "must be between 1 and 10000")
    .optional(),
});

// OpenAPI parameter objects for the query above. Hand-written because
// z.toJSONSchema of a transform pipeline documents the wire type poorly; they
// sit here, next to the schema they describe, so a change to one is a change
// to the other in the same diff.
export const READINGS_QUERY_PARAMETERS = [
  {
    name: "from",
    in: "query",
    required: false,
    schema: { type: "string", format: "date-time" },
    description:
      "Return readings with recordedAt >= from (ISO 8601). Filters on the " +
      "device clock — see the recordedAt caveat.",
  },
  {
    name: "to",
    in: "query",
    required: false,
    schema: { type: "string", format: "date-time" },
    description: "Return readings with recordedAt <= to (ISO 8601).",
  },
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 10000, default: 1000 },
    description: "Maximum rows returned, newest first by receivedAt.",
  },
] as const;

export const ReadingsResponseSchema = z.object({
  sensorId: z.string(),
  count: z.number().int(),
  readings: z.array(ReadingSchema),
});

export const SensorListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  isExperimental: z.boolean(),
  lastSeenAt: z.string().nullable(),
  latestReading: ReadingSchema.nullable(),
});

export const SensorDetailSchema = SensorListItemSchema.omit({
  isExperimental: true,
}).extend({
  firmwareVersion: z.string().nullable(),
  readingIntervalS: z.number().int(),
  createdAt: z.string(),
});

export const ErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.string()).optional(),
});

// Inferred response types — import these in the frontend rather than
// hand-writing shapes. They are generated from the same schemas the routes
// validate against and the OpenAPI document is built from, so all three move
// together or not at all.
export type ApiReadingsResponse = z.infer<typeof ReadingsResponseSchema>;
export type ApiSensorListItem = z.infer<typeof SensorListItemSchema>;
export type ApiSensorDetail = z.infer<typeof SensorDetailSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;
