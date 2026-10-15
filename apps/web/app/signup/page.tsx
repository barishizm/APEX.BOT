import type { Metadata } from "next";
import { Home } from "@/components/landing/home";

export const metadata: Metadata = {
  title: "Sign up",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <Home initialAuth="register" />;
}
