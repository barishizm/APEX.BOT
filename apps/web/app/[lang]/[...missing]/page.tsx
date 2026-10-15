import { notFound } from "next/navigation";

// Any other path under a language renders that language's 404 page
export default function Missing() {
  notFound();
}
