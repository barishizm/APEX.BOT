import type { Metadata } from "next";
import { Home } from "@/components/landing/home";
import { getMarketingDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";

// The landing page with the auth modal open; the landing page itself is the indexed URL
export async function generateMetadata({ params }: PageProps<"/[lang]/signup">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = (await getMarketingDictionary(locale)).meta.signup;
  return pageMetadata({ locale, path: "/signup", title, description, index: false });
}

export default async function Page({ params }: PageProps<"/[lang]/signup">) {
  return <Home locale={await resolveLocale(params)} initialAuth="register" />;
}
