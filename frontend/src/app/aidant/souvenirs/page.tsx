"use client";

/**
 * Page « Souvenirs » de l'espace aidant (module F4) — URL : /aidant/souvenirs
 *
 * L'aidant peut :
 *  - ajouter un souvenir (le récit et le quiz sont générés par l'IA à l'enregistrement) ;
 *  - voir le récit et le quiz que le senior entendra ;
 *  - modifier ou supprimer un souvenir ;
 *  - masquer ou démasquer un souvenir pour le senior (sans le supprimer) ;
 *  - relire et valider les souvenirs racontés à voix haute par le senior.
 *
 * La page ne fait qu'assembler les composants du module (components/souvenirs et lib/souvenirs).
 */
import { useState } from "react";
import { BookHeart, Mic, Plus } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, Tabs } from "@/components/ui";
import { memoryApi, memoryPaths } from "@/lib/souvenirs/api";
import type { Memory } from "@/lib/souvenirs/types";
import { MemoryCard } from "@/components/souvenirs/MemoryCard";
import { MemoryDetailModal } from "@/components/souvenirs/MemoryDetailModal";
import { MemoryFormModal } from "@/components/souvenirs/MemoryFormModal";
import { useCurrentSenior } from "../SeniorContext";

type Filter = "tous" | "a_valider";
// Fenêtre ouverte : formulaire (création / modification / validation) ou aperçu
type Dialog = { kind: "create" } | { kind: "edit" | "validate" | "view"; memory: Memory } | null;

export default function SouvenirsPage() {
  const { senior, base, refreshUnread } = useCurrentSenior();
  const [filter, setFilter] = useState<Filter>("tous");
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, error, loading, reload, setData } = useApi<{ memories: Memory[]; pendingCount: number }>(memoryPaths.list(base));

  if (loading && !data) return <Spinner />;
  const memories = data?.memories ?? [];
  const pendingCount = data?.pendingCount ?? 0;
  // Les souvenirs à valider s'affichent toujours en premier
  const shown = [...(filter === "a_valider" ? memories.filter((m) => m.status === "a_valider") : memories)].sort(
    (a, b) => Number(b.status === "a_valider") - Number(a.status === "a_valider"),
  );

  async function remove(m: Memory) {
    if (!confirm(`Supprimer le souvenir « ${m.title} » ? Cette action est définitive.`)) return;
    await memoryApi.remove(base, m._id);
    reload();
  }

  // Masquer / démasquer pour le senior : la liste est mise à jour aussitôt
  async function toggleVisibility(m: Memory, hidden: boolean) {
    await memoryApi.setVisibility(base, m._id, hidden);
    reload();
  }

  // Après une sauvegarde : on recharge la liste et le compteur d'alertes du menu
  // (la version renvoyée par le serveur remplace aussitôt l'ancienne dans la liste)
  const afterSave = (saved?: Memory) => {
    if (saved) {
      setData((cur) => {
        if (!cur) return cur;
        const exists = cur.memories.some((m) => m._id === saved._id);
        return { ...cur, memories: exists ? cur.memories.map((m) => (m._id === saved._id ? saved : m)) : [saved, ...cur.memories] };
      });
    }
    reload();
    refreshUnread();
  };

  return (
    <div className="fade-up">
      <PageHeader
        title={`Souvenirs de ${senior.firstName}`}
        subtitle="Le senior peut les écouter à voix haute, puis jouer à un petit quiz pour stimuler sa mémoire"
        action={
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus className="h-4 w-4" /> Ajouter un souvenir
          </Button>
        }
      />

      {/* Bandeau : souvenirs racontés par le senior, en attente de relecture */}
      {pendingCount > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 border-violet-200 bg-violet-50 p-4">
          <Mic className="h-5 w-5 text-violet-500" />
          <p className="flex-1 text-sm font-bold text-ink">
            {senior.firstName} a raconté {pendingCount} souvenir{pendingCount > 1 ? "s" : ""}. Relisez-le{pendingCount > 1 ? "s" : ""} pour qu&apos;il
            {pendingCount > 1 ? "s apparaissent" : " apparaisse"} dans sa liste.
          </p>
          <Button size="sm" variant="outline" onClick={() => setFilter("a_valider")}>
            Voir
          </Button>
        </Card>
      )}

      <div className="mb-4">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: "tous", label: "Tous", count: memories.length },
            { value: "a_valider", label: "À valider", count: pendingCount },
          ]}
        />
      </div>

      <ErrorBox>{error}</ErrorBox>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookHeart className="h-6 w-6" />}
            title={filter === "a_valider" ? "Aucun souvenir à valider" : "Aucun souvenir pour l'instant"}
            text="Ajoutez un moment important de sa vie : un mariage, une naissance, des vacances…"
            action={
              filter === "tous" && (
                <Button onClick={() => setDialog({ kind: "create" })}>
                  <Plus className="h-4 w-4" /> Ajouter un souvenir
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((m) => (
            <MemoryCard
              key={m._id}
              base={base}
              memory={m}
              onView={() => setDialog({ kind: "view", memory: m })}
              onEdit={() => setDialog({ kind: "edit", memory: m })}
              onValidate={() => setDialog({ kind: "validate", memory: m })}
              onToggleVisibility={(hidden) => toggleVisibility(m, hidden)}
              onDelete={() => remove(m)}
            />
          ))}
        </div>
      )}

      {/* Fenêtres : une seule ouverte à la fois */}
      {dialog?.kind === "create" && <MemoryFormModal base={base} mode="create" onClose={() => setDialog(null)} onSaved={afterSave} />}
      {(dialog?.kind === "edit" || dialog?.kind === "validate") && (
        <MemoryFormModal base={base} mode={dialog.kind} memory={dialog.memory} onClose={() => setDialog(null)} onSaved={afterSave} />
      )}
      {dialog?.kind === "view" && <MemoryDetailModal base={base} memory={dialog.memory} onClose={() => setDialog(null)} onUpdated={afterSave} />}
    </div>
  );
}
