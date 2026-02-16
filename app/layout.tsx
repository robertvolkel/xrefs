import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";
import AuthProvider from "@/components/AuthProvider";
import I18nProvider from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/server";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "XRefs — Component Cross-Reference Tool",
  description: "Find replacement electronic components with parametric comparison",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase not configured — user stays null
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry>
          <AuthProvider initialUser={user}>
            <I18nProvider>
              {children}
            </I18nProvider>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
