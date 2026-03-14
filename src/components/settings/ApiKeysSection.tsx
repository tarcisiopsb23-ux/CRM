import { useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { maskSecret } from "@/types/settings";
import type { ApiKeyItem, ApiKeysConfig } from "@/types/settings";
import { Plus, Trash2, Key } from "lucide-react";

export function ApiKeysSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "api_keys");
  const raw = data as { config?: ApiKeysConfig } | null;
  const config = raw?.config ?? {};
  const keys = config.keys ?? [];
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAdd = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    const item: ApiKeyItem = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      value: newValue.trim(),
    };
    const updated: ApiKeysConfig = { keys: [...keys, item] };
    await upsert.mutateAsync(updated);
    setNewName("");
    setNewValue("");
  };

  const handleRemove = async (id: string) => {
    const updated: ApiKeysConfig = {
      keys: keys.filter((k) => k.id !== id),
    };
    await upsert.mutateAsync(updated);
  };

  if (isLoading) {
    return (
      <SettingsSection title="API Keys" icon={<Key className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="API Keys"
      description="Chaves de API para integrações externas. Armazenadas com segurança no Supabase."
      icon={<Key className="h-5 w-5" />}
    >
      <div className="space-y-4">
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50"
          >
            <div>
              <p className="font-medium text-gray-dark">{k.name}</p>
              <p className="text-xs text-gray-500 font-mono">
                {maskSecret(k.value)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(k.id)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome (ex: Stripe)"
            className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Chave"
            className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            onClick={handleAdd}
            disabled={!newName.trim() || !newValue.trim()}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
