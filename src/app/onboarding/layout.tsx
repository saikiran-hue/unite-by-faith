import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profile Details" };

export default function Layout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
