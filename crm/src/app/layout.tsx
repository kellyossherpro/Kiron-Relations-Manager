import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KRM", template: "%s · KRM" },
  description: "Kiron Relations Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sauce+One:wght@400;600;700;900&display=swap" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
