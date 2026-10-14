import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native Skia binary: must be required at runtime from node_modules, not bundled.
  serverExternalPackages: ["@napi-rs/canvas"],
  // The label renderer reads its fonts by path; file tracing cannot see that.
  outputFileTracingIncludes: {
    "/api/admin/sensors/[id]/label": ["./src/lib/label/fonts/**"],
  },
};

export default nextConfig;
