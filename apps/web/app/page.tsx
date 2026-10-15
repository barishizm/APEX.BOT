import { redirect } from "next/navigation";
import { Home } from "@/components/landing/home";

// Old modal links (/?login=1, /?signup=1) land on the clean routes
export default async function HomePage({ searchParams }: { searchParams: Promise<{ login?: string; signup?: string; error?: string }> }) {
  const { login, signup, error } = await searchParams;
  if (signup === "1") redirect("/signup");
  if (login === "1") redirect(error ? `/login?error=${encodeURIComponent(error)}` : "/login");
  return <Home />;
}
