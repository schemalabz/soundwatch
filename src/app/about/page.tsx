import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-blue-600 text-sm hover:underline">
        ← Back to map
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-6">About Soundwatch Athens</h1>

      <div className="prose prose-gray">
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

        <h2>How It Works</h2>
        <p>
          Each sensor measures noise levels (in dBA) locally on the device and
          transmits only the computed value — never raw audio — ensuring complete
          privacy. The data flows in real-time to this platform, where it&apos;s
          visualized on the interactive map.
        </p>

        <h2>Open Data</h2>
        <p>
          All sensor data is freely available through our public API. Anyone can
          access the data programmatically to build their own tools, conduct
          research, or advocate for change in their neighborhood.
        </p>
        <p>
          API endpoint:{" "}
          <code className="bg-gray-100 px-1 rounded">/api/sensors</code>
        </p>

        <h2>Who We Are</h2>
        <p>
          Soundwatch Athens is built by{" "}
          <strong>Schema Labs</strong>, which builds technology that strengthens
          democracy, and <strong>Astylab</strong>, a community partner
          activating its ecosystem for urban transformation.
        </p>

        <h2>Technology</h2>
        <p>
          Built on the open-source{" "}
          <a
            href="https://smartcitizen.me"
            className="text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Smart Citizen Kit
          </a>{" "}
          platform. All software developed for Soundwatch is open source.
        </p>
      </div>
    </div>
  );
}
