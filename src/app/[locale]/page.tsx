import { MapSection } from "@/components/map/MapSection";
import { getMockSensors } from "@/lib/mockSensors";

export default function Home() {
  // Redesign uses generated mock sensors (Athens coords + per-layer values).
  const sensors = getMockSensors();
  return <MapSection sensors={sensors} />;
}
