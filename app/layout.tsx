import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/ThemeRegistry";
import AuthProvider from "@/components/AuthProvider";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeRegistry>
          <AuthProvider initialUser={user}>
            {children}
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
