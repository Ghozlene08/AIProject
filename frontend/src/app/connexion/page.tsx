import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
