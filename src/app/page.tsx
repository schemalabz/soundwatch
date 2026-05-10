import { MapSection } from "@/components/map/MapSection";

async function getSensors() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/sensors`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const sensors = await getSensors();

  return <MapSection sensors={sensors} />;
}
