import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import NavBar from "@/components/NavBar";
import "./globals.css";

const ui = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "QuickCare",
  description: "Routing and advance alerts for ambulances in Bengaluru",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={ui.variable}>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
