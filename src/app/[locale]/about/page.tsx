import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        {t("backToMap")}
      </Link>

      <h1 className="text-3xl font-bold mt-4 mb-6">{t("title")}</h1>

      <div className="space-y-6 text-[15px] leading-relaxed">
        <p>{t("intro")}</p>

        <p>{t("introProblem")}</p>

        <p>
          <strong>{t("mission")}</strong>
        </p>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("howItWorksTitle")}</h2>
          <p>{t("howItWorks")}</p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("openDataTitle")}</h2>
          <p>{t("openData")}</p>
          <p className="mt-2">
            {t("apiEndpoint")}{" "}
            <code className="bg-light border border-border px-2 py-0.5 rounded text-sm font-mono">
              /api/sensors
            </code>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("whoWeAreTitle")}</h2>
          <p>
            {t.rich("whoWeAre", {
              schemaLabs: (chunks) => (
                <a
                  href="https://schemalabs.gr"
                  className="text-primary underline hover:text-primary-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
              skroutz: (chunks) => (
                <a
                  href="https://skroutz.gr"
                  className="text-primary underline hover:text-primary-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
              astylab: (chunks) => (
                <a
                  href="https://astylab.gr"
                  className="text-primary underline hover:text-primary-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-2">{t("technologyTitle")}</h2>
          <p>
            {t.rich("technology", {
              link: (chunks) => (
                <a
                  href="https://smartcitizen.me"
                  className="text-primary underline hover:text-primary-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
              repo: (chunks) => (
                <a
                  href="https://github.com/schemalabz/soundwatch"
                  className="text-primary underline hover:text-primary-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
