import type { Metadata, Viewport } from "next";
// @ts-expect-error Next.js handles global CSS imports at build time.
import "./globals.css";

export const metadata: Metadata = {
  title: "DALA — вкус степи, ритм города",
  description: "Кафе и казахская кухня в Курыке. Меню и заказ онлайн.",
  applicationName: "DALA",
};

export const viewport: Viewport = {
  themeColor: "#f7f5ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
