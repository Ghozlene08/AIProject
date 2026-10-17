import type { Metadata } from "next";
// Police Nunito Sans embarquée dans le projet (pas d'appel à Google Fonts)
import "@fontsource-variable/nunito-sans";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "Senior Assistant — Votre voix, votre quotidien",
    template: "%s · Senior Assistant",
  },
  description:
    "Assistant vocal intelligent pour l'autonomie des personnes âgées, avec un espace dédié aux aidants.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
