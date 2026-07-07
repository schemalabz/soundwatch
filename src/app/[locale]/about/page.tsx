import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 w-full">
      <Link href="/" className="sw-label text-xs text-muted hover:text-ink">
        {t("backToMap")}
      </Link>

      <h1 className="sw-h text-[34px] mt-5 mb-6">{t("title")}</h1>

      <div className="space-y-6 text-[15px] leading-relaxed text-ink/85">
        <p>{t("intro")}</p>

        <p>{t("introProblem")}</p>

        <p>
          <strong>{t("mission")}</strong>
        </p>

        <div>
          <h2 className="sw-h text-[18px] mb-2">{t("howItWorksTitle")}</h2>
          <p>{t("howItWorks")}</p>
        </div>

        <div>
          <h2 className="sw-h text-[18px] mb-2">{t("openDataTitle")}</h2>
          <p>{t("openData")}</p>
          <p className="mt-2">
            {t("apiEndpoint")}{" "}
            <code className="bg-[var(--sw-chrome-bg)] border-[0.5px] border-hairline px-2 py-0.5 rounded text-sm font-mono text-ink">
              /api/sensors
            </code>
          </p>
        </div>

        <div>
          <h2 className="sw-h text-[18px] mb-2">{t("whoWeAreTitle")}</h2>
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
          <h2 className="sw-h text-[18px] mb-2">{t("technologyTitle")}</h2>
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
