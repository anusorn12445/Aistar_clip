import type { Metadata } from "next";
import { Anuphan, Geist_Mono } from "next/font/google";
import "./globals.css";

// ฟอนต์หลัก — Anuphan (ไทย+latin, self-host) แทน system font
const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AISTAR Talent OS",
  description: "ระบบบริหารจัดการ AI Talent / AI Short Drama / Live Commerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="light"
      className={`${anuphan.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ธีม: html มี data-theme="light" จาก server เสมอ — ThemeToggle อ่าน localStorage
            แล้วสลับหลัง mount (ห้ามใส่ raw <script> ใน JSX — React 19 client render พังทั้งแอป) */}
        {children}
      </body>
    </html>
  );
}
