import { useEffect, useState } from "react";
import { supabaseCrm } from "@/lib/supabase";
import { Activity } from "lucide-react";

interface Props {
  onSelect: (tenantId: string, tenantName: string) => void;
}

interface ClientRow {
  id: string;
  name: string;
}

export function TenantSelector({ onSelect }: Props) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    supabaseCrm
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        setClients(data ?? []);
        setLoading(false);
      });
  }, []);

  const handleConfirm = () => {
    const client = clients.find((c) => c.id === selected);
    if (client) onSelect(client.id, client.name);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 bg-orange-500/20 border border-orange-500/40 rounded-2xl flex items-center justify-center mb-2">
            <Activity className="h-8 w-8 text-orange-400" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">
            Sessão de Suporte
          </h2>
          <p className="text-slate-400 text-sm">
            Selecione o tenant que deseja visualizar.
          </p>
        </div>

        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
            </div>
          ) : (
            <>
              <label className="block text-slate-300 text-sm font-bold mb-1">
                Cliente / Tenant
              </label>
              <select
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="" disabled>
                  — Selecione um cliente —
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleConfirm}
                disabled={!selected}
                className="w-full bg-[#7C3AED] hover:bg-[#7C3AED]/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
              >
                Acessar Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
