import { useNavigate, useParams } from "react-router-dom";
import { Link2, Users, CreditCard, Puzzle, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";

function buildRedirectUrl(destination: string): string {
  return `${window.location.origin}/r?to=${encodeURIComponent(destination)}`;
}

function RedirectLinkGenerator() {
  const [destination, setDestination] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const handleGenerate = () => {
    const trimmed = destination.trim();
    if (!trimmed) { toast.error("Informe a URL de destino."); return; }
    const withProtocol = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    setGeneratedUrl(buildRedirectUrl(withProtocol));
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Gera um link curto que redireciona instantaneamente para qualquer URL. Útil para encaminhar clientes para promoções, cardápios ou páginas externas.
      </p>
      <div className="grid gap-2">
        <Label>URL de destino</Label>
        <div className="flex gap-2">
          <Input
            value={destination}
            onChange={(e) => { setDestination(e.target.value); setGeneratedUrl(null); }}
            placeholder="Ex: https://menu.link/meu-negocio"
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGenerate())}
          />
          <Button type="button" onClick={handleGenerate} className="shrink-0">
            <Link2 className="h-4 w-4 mr-2" />
            Gerar
          </Button>
        </div>
      </div>
      {generatedUrl && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Link gerado</p>
          <div className="flex items-center gap-2 bg-background rounded-md border border-border px-3 py-2 overflow-hidden">
            <span className="text-sm font-mono flex-1 break-all">{generatedUrl}</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedUrl!); toast.success("Copiado!"); }} className="gap-2">
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => window.open(generatedUrl!, "_blank", "noopener")} className="gap-2">
              <ExternalLink className="h-3.5 w-3.5" /> Testar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfiguracoesPage() {
  const { auth } = useClientAuth();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const userRole = auth?.user?.role ?? "viewer";
  const isAdmin  = ["owner", "admin"].includes(userRole);
  const isOwner  = userRole === "owner";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Acesse as configurações do seu painel."
      />

      {/* Links rápidos para sub-configurações */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Usuários e Permissões", desc: "Convidar usuários e gerenciar roles", icon: Users,   path: "configuracoes/usuarios",   show: true    },
            { label: "Pagamentos",            desc: "Asaas e métodos de pagamento",        icon: CreditCard, path: "configuracoes/pagamentos", show: isOwner },
            { label: "Integrações",           desc: "Pixels, UTM Builder e anúncios",      icon: Puzzle,  path: "configuracoes/integracoes", show: true    },
          ]
            .filter(item => item.show)
            .map(({ label, desc, icon: Icon, path }) => (
              <button
                key={path}
                onClick={() => navigate(`/${slug}/${path}`)}
                className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </button>
            ))
          }
        </div>
      )}

      {/* Gerador de link de redirecionamento */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            Link de Redirecionamento Rápido
          </CardTitle>
          <CardDescription>
            Crie links de redirecionamento instantâneo para qualquer URL. Não é salvo no banco de dados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RedirectLinkGenerator />
        </CardContent>
      </Card>
    </div>
  );
}
