import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In" };

export default function Layout({ children }: LayoutProps<"/auth">) {
  return children;
}
