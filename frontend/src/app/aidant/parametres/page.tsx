"use client";

import { AccountSettings } from "@/components/AccountSettings";
import { PageHeader } from "@/components/ui";

export default function ParametresPage() {
  return (
    <div className="fade-up">
      <PageHeader title="Paramètres" subtitle="Votre compte, vos notifications et votre sécurité" />
      <AccountSettings />
    </div>
  );
}
