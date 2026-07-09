import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vew APM",
  description: "Spring Boot actuator monitor",
};

// Runs before paint to apply saved theme/heartbeat/lang (no flash of wrong theme).
const PREF_SCRIPT = `(function(){try{
  var t=localStorage.getItem('apm.theme');
  if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);
  else document.documentElement.removeAttribute('data-theme');
  var hb=localStorage.getItem('apm.heartbeat')||'normal';
  document.documentElement.setAttribute('data-hb',hb);
  var l=localStorage.getItem('apm.lang'); if(l)document.documentElement.lang=l;
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREF_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
