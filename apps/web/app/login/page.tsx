import type { Metadata } from "next";
import { Home } from "@/components/landing/home";

export const metadata: Metadata = {
  title: "Log in",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <Home initialAuth="login" initialError={error} />;
}
