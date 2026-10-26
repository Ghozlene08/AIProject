"use client";

import { ACTION_LABELS, type SeniorAssistant } from "@/lib/assistant/useSeniorAssistant";

export function AssistantAction({ assistant, paused }: { assistant: SeniorAssistant; paused: boolean }) {
  if (!assistant.action) return null;
  return <button type="button" onClick={assistant.executeAction} disabled={paused} className="mt-4 min-h-16 rounded-2xl bg-brand-700 px-6 py-3 text-[22px] font-bold text-white disabled:opacity-50">{ACTION_LABELS[assistant.action]}</button>;
}
