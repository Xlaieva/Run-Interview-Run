import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/shell/app-header";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "刷题台",
  description: "个人力扣刷题练习平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m={dark:"dark",white:"theme-white",pink:"theme-pink",yellow:"theme-yellow",blue:"theme-blue",cyan:"theme-cyan",purple:"theme-purple"};var t=localStorage.getItem("theme");document.documentElement.classList.add(m[t]||"dark")}catch(e){document.documentElement.classList.add("dark")}})()`,
          }}
        />
      </head>
      <body className="h-dvh flex flex-col bg-background text-foreground">
        <TooltipProvider delay={200}>
          <AppHeader />
          <ThemeToggle />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  );
}
