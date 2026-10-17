import { AudioLines, Brain, Mic, ScanText } from "lucide-react";
import type { AiCall, AiProvider } from "@/lib/types";
import { Badge } from "@/components/ui";

export const CAPABILITIES: Record<AiProvider["capability"], { label: string; icon: typeof Brain }> = {
  llm: { label: "Modèles de langage (LLM)", icon: Brain },
  stt: { label: "Reconnaissance vocale (STT)", icon: Mic },
  tts: { label: "Synthèse vocale (TTS)", icon: AudioLines },
  ocr: { label: "Lecture de documents (OCR)", icon: ScanText },
};

export function CallStatus({ call }: { call: AiCall }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {call.status === "succes" ? <Badge tone="ok">Succès</Badge> : <Badge tone="danger">Erreur</Badge>}
      {call.fallback && <Badge tone="warn">Secours</Badge>}
    </span>
  );
}

export function ProviderState({ p }: { p: AiProvider }) {
  if (!p.enabled) return <Badge tone="muted">Désactivé</Badge>;
  if (p.simulateFailure) return <Badge tone="danger">Panne simulée</Badge>;
  if (!p.configured) return <Badge tone="warn">Clé API absente</Badge>;
  return (
    <Badge tone="ok">
      <span className="h-1.5 w-1.5 rounded-full bg-ok-500" /> Opérationnel
    </Badge>
  );
}
