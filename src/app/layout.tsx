import type { Metadata } from "next";
import { Lora, Plus_Jakarta_Sans } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/components/ubf/theme-script";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  variable: "--font-body-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const verse = Lora({
  variable: "--font-verse-face",
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Unite by Faith — Faith, Friends, Grow Together",
    template: "%s · Unite by Faith",
  },
  description:
    "Find Christ-centered friends: small fellowship pods of 3–4 and 1v1 faith companions, matched on faith first, then hobbies, tastes and everyday life.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by the inline script, so React must not warn about it.
    <html lang="en" className={`${body.variable} ${verse.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="ubf ubf-frame">{children}</body>
    </html>
  );
}
