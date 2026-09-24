// src/components/propostas/wizard/StepCliente.tsx
import { useState, useMemo } from "react";
import { Search, Building2, Phone, Mail, Check, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";
import type { Client } from "@/types/crm";

interface Props {
  organizationId: string;
  selectedClient: Client | null;
  onSelect: (client: Client) => void;
  onNext: () => void;
}

export function StepCliente({ organizationId, selectedClient, onSelect, onNext }: Props) {
  const [search, setSearch] = useState("");
  const { data: clients = [], isLoading } = useClients(organizationId);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients.slice(0, 40);
    return clients.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [clients, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Para qual cliente é esta proposta?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Busque pelo nome, empresa ou e-mail. O cliente deve estar cadastrado no CRM.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lista de clientes */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
          <UserPlus className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum cliente encontrado para "{search}".</p>
          <p className="text-xs">Cadastre o cliente no módulo de clientes antes de criar a proposta.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {filtered.map((client) => {
            const isSelected = selectedClient?.id === client.id;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => onSelect(client)}
                className={cn(
                  "w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isSelected ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    (client.name ?? "?")[0].toUpperCase()
                  )}
                </div>

                {/* Dados */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{client.name}</span>
                    {client.company && (
                      <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {client.company}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {client.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3" />
                        {client.email}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <Badge variant="default" className="shrink-0 text-xs">
                    Selecionado
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Card de confirmação do cliente selecionado */}
      {selectedClient && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              {(selectedClient.name ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm">{selectedClient.name}</p>
              {selectedClient.company && (
                <p className="text-xs text-muted-foreground">{selectedClient.company}</p>
              )}
            </div>
          </div>
          <Button size="sm" onClick={onNext}>
            Continuar →
          </Button>
        </div>
      )}
    </div>
  );
}
