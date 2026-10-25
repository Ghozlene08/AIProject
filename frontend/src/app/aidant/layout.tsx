import type { Metadata } from "next";
import { AidantShell } from "./AidantShell";
import CaregiverCallListener from "./CaregiverCallListener";

export const metadata: Metadata = { title: { default: "Espace Aidant", template: "%s · Espace Aidant" } };

export default function AidantLayout({ children }: LayoutProps<"/aidant">) {
  return <AidantShell>{children}
              <CaregiverCallListener />

  </AidantShell>;
}
