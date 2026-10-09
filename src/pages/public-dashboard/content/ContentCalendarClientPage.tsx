/**
 * ContentCalendarClientPage — calendário editorial standalone para o cliente.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useClientContentItems } from "@/hooks/useClientContent";
import { ClientContentCalendar } from "@/components/content/ClientContentCalendar";
import { ClientApprovalPanel }   from "@/components/content/ClientApprovalPanel";
import type { ClientContentItem, ClientApprovalDecision } from "@/hooks/useClientContent";

export function ContentCalendarClientPage() {
  const { auth, slug } = useClientAuth();
  const clientId       = auth?.id ?? "";
  const organizationId = auth?.organization_id ?? "";
  const accessToken    = auth?.session?.access_token ?? "";

  const { items, approve } = useClientContentItems(clientId);
  const [panelItem, setPanelItem] = useState<ClientContentItem | null>(null);

  async function handleDecision(
    itemId:   string,
    decision: ClientApprovalDecision,
    notes:    string,
  ) {
    await approve({ itemId, decision, notes, accessToken });
    setPanelItem(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-black text-white tracking-tight">Calendário</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Programação editorial da sua marca.
        </p>
      </div>

      <ClientContentCalendar
        clientId={clientId}
        organizationId={organizationId}
        onItemClick={itemId => {
          const found = items.find(i => i.id === itemId);
          if (found) setPanelItem(found);
        }}
      />

      <ClientApprovalPanel
        item={panelItem}
        open={!!panelItem}
        onClose={() => setPanelItem(null)}
        onDecision={handleDecision}
      />
    </div>
  );
}
