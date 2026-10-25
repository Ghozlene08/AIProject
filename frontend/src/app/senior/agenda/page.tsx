import type { Metadata } from "next";
import { SeniorAgendaApp } from "./SeniorAgendaApp";

export const metadata: Metadata = { title: "Mon agenda" };

// Module F2 « Agenda et rappels » de l'interface Senior.
// Page autonome : le routage avec les autres pages Senior sera fait par l'équipe.
export default function SeniorAgendaPage() {
  return <SeniorAgendaApp />;
}
