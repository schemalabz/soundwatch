import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const GITHUB_REPO = "schemalabz/soundwatch-firmware";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

async function fetchRelease(tag?: string): Promise<GitHubRelease | null> {
  const url = tag
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${tag}`
    : `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      ...(process.env.GITHUB_TOKEN && {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      }),
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function GET(request: NextRequest) {
  const currentVersion = request.headers.get("x-firmware-version");
  const deviceId = request.headers.get("x-device-id");

  // Look up per-device target version if device_id is provided
  let targetVersion: string | null = null;
  if (deviceId) {
    const sensor = await prisma.sensor.findUnique({
      where: { deviceId },
      select: { targetFirmwareVersion: true },
    });
    targetVersion = sensor?.targetFirmwareVersion ?? null;
  }

  // Fetch the appropriate release
  const release = await fetchRelease(targetVersion ?? undefined);
  if (!release) {
    return NextResponse.json(
      { error: "Failed to check for updates" },
      { status: 502 }
    );
  }

  const latestVersion = release.tag_name.replace(/^v/, "");

  // If sensor is already on the target version, return 304
  if (currentVersion === latestVersion) {
    return new NextResponse(null, { status: 304 });
  }

  // Find the firmware binary asset
  const firmwareAsset = release.assets.find((a) => a.name === "firmware.bin");
  if (!firmwareAsset) {
    return NextResponse.json(
      { error: "No firmware binary in release" },
      { status: 404 }
    );
  }

  // ESP8266 devices cannot follow the redirect to GitHub (HTTPS/TLS memory),
  // so ?raw=1 streams the binary through us over the device's plain-HTTP
  // connection instead of redirecting.
  if (request.nextUrl.searchParams.get("raw") === "1") {
    const bin = await fetch(firmwareAsset.browser_download_url);
    if (!bin.ok || !bin.body) {
      return NextResponse.json({ error: "Failed to fetch firmware binary" }, { status: 502 });
    }
    return new NextResponse(bin.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(firmwareAsset.size),
        "X-Firmware-Version": latestVersion,
      },
    });
  }

  // Redirect to the GitHub release binary
  return NextResponse.redirect(firmwareAsset.browser_download_url, {
    headers: {
      "X-Firmware-Version": latestVersion,
    },
  });
}
