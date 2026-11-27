import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "normalize.css";
import "./globals.css";
import "./theme.css";
import { AuthProvider } from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
  title: {
    default: "PropertyIQ | Property operations",
    template: "%s | PropertyIQ",
  },
  description:
    "Manage properties, maintenance, assets, service providers, and operational alerts from one secure workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
