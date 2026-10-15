import type { Metadata } from "next";
import { Home } from "@/components/landing/home";
import { getDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";

// The landing page with the auth modal open; the landing page itself is the indexed URL
export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return pageMetadata({ locale, path: "/login", title: getDictionary(locale).meta.login.title, index: false });
}

export default async function Page({ params }: PageProps<"/[lang]/login">) {
  return <Home locale={await resolveLocale(params)} initialAuth="login" />;
}
