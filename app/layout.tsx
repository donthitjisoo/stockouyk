import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "個人投資管理 Dashboard",
  description: "CSV backed Taiwan stock recommendation and portfolio manager"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
