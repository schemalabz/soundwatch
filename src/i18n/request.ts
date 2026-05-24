import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const messageImports = {
  el: () => import("../messages/el.json"),
  en: () => import("../messages/en.json"),
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as "el" | "en")) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await messageImports[locale as "el" | "en"]()).default,
  };
});
