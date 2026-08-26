import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luma Health — Personal wellness assessment",
  description:
    "A private two-minute assessment that turns your goals into a practical wellness plan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
