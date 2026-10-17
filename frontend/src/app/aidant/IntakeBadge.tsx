import { Check, Clock, X } from "lucide-react";
import type { Intake } from "@/lib/types";
import { Badge } from "@/components/ui";

export function IntakeBadge({ status }: { status: Intake["status"] }) {
  if (status === "confirme")
    return (
      <Badge tone="ok">
        <Check className="h-3 w-3" /> Confirmé
      </Badge>
    );
  if (status === "manque")
    return (
      <Badge tone="danger">
        <X className="h-3 w-3" /> Non confirmé
      </Badge>
    );
  return (
    <Badge tone="muted">
      <Clock className="h-3 w-3" /> À venir
    </Badge>
  );
}
