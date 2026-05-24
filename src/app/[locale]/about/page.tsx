import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        ← Back to map
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-6">About Soundwatch Athens</h1>

      <div className="space-y-6 text-[15px] leading-relaxed">
        <p>
          Athens consistently ranks among the noisiest capitals in Europe. Noise
          pollution is a critical urban challenge with direct impacts on public
          health and quality of life. Despite the scale of the problem, Athens
          today lacks a public, accessible noise monitoring network.
        </p>

        <p>
          <strong>Soundwatch Athens</strong> fills this gap by creating the
          city&apos;s first live noise map through a network of ~50 sensors
          deployed at Skroutz physical stores across Athens.
        </p>

        <div>
          <h2 className="text-lg font-bold mb-2">How It Works</h2>
          <p>
            Each sensor measures noise levels (in dBA) locally on the device and
            transmits only the computed value — never raw audio — ensuring complete
            privacy. The data flows in real-time to this platform, where it&apos;s
            visualized on the interactive map.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">Open Data</h2>
          <p>
            All sensor data is freely available through our public API. Anyone can
            access the data programmatically to build their own tools, conduct
            research, or advocate for change in their neighborhood.
          </p>
          <p className="mt-2">
            API endpoint:{" "}
            <code className="bg-light border border-border px-2 py-0.5 rounded text-sm font-mono">
              /api/sensors
            </code>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">Who We Are</h2>
          <p>
            Soundwatch Athens is built by{" "}
            <strong>Schema Labs</strong>, which builds technology that strengthens
            democracy, and <strong>Astylab</strong>, a community partner
            activating its ecosystem for urban transformation.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">Technology</h2>
          <p>
            Built on the open-source{" "}
            <a
              href="https://smartcitizen.me"
              className="text-primary underline hover:text-primary-dark"
              target="_blank"
              rel="noopener noreferrer"
            >
              Smart Citizen Kit
            </a>{" "}
            platform. All software developed for Soundwatch is open source.
          </p>
        </div>
      </div>
    </div>
  );
}
