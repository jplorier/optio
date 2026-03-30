import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-ibm-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Optio — Workflow Orchestration for AI Coding Agents",
    template: "%s | Optio",
  },
  description:
    "Turn tickets into merged pull requests with AI coding agents. Optio handles the full lifecycle — intake, execution, CI monitoring, code review, and merge.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Optio",
    title: "Optio — Workflow Orchestration for AI Coding Agents",
    description:
      "Turn tickets into merged pull requests with AI coding agents. Autonomous feedback loops drive every task to completion.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Optio — Workflow Orchestration for AI Coding Agents",
    description:
      "Turn tickets into merged pull requests with AI coding agents. Autonomous feedback loops drive every task to completion.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${ibmPlexMono.variable}`}>
      <body className="flex min-h-screen flex-col relative">
        <Header />
        <main className="flex-1 relative z-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
