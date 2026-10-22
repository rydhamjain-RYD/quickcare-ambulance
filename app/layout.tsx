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

// Pages shown inside the Live demo frames add ?embed=1. This marks the page before it first paints,
// so the header and back links never flash inside a frame.
const EMBED_FLAG = `if (location.search.indexOf("embed=1") !== -1) document.documentElement.setAttribute("data-embed", "1");`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={ui.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EMBED_FLAG }} />
      </head>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
