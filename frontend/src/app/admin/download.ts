import { API_URL, tokenStore } from "@/lib/api";

// Télécharge un export CSV de l'API (le jeton est envoyé dans l'en-tête, pas dans l'URL)
export async function downloadExport(type: "kpis" | "events" | "ai-calls", days: number) {
  const res = await fetch(`${API_URL}/admin/export?type=${type}&days=${days}`, {
    headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
  });
  if (!res.ok) throw new Error(`Export impossible (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `senior-assistant-${type}-${days}j.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
