import type { Metadata } from "next";
import { SeniorMedicamentsApp } from "./SeniorMedicamentsApp";

export const metadata: Metadata = { title: "Mes médicaments" };

// Module F2 : traitements du senior et prises du jour (saisis par l'aidant)
export default function SeniorMedicamentsPage() {
  return <SeniorMedicamentsApp />;
}
