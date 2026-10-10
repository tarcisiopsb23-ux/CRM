/**
 * ContentParceirosPage — gestão de parceiros/terceirizados do módulo de conteúdo.
 * Rota: /content/parceiros
 *
 * Permite à agência:
 *   - Listar parceiros ativos e inativos
 *   - Convidar novo parceiro (cria auth.users via Edge Function partner-invite)
 *   - Editar dados (nome, especialidade, telefone)
 *   - Desativar / reativar
 */

import { useState } from "react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Badge }     from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, MoreVertical, UserX, UserCheck, Pencil, Copy, Loader2, Users,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePartnerUsers, type PartnerUser } from "@/hooks/usePartnerUsers";

// ── Schema ────────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email:        z.string().email("E-mail inválido"),
  full_name:    z.string().min(2, "Nome obrigatório"),
  specialty:    z.string().optional(),
  phone:        z.string().optional(),
  partner_slug: z.string().optional(),
  password:     z.string().min(8, "Mínimo 8 caracteres").optional().or(z.literal("")),
});
type InviteValues = z.infer<typeof inviteSchema>;

const SPECIALTIES: { value: string; label: string }[] = [
  { value: "designer",     label: "Designer" },
  { value: "videomaker",   label: "Videomaker" },
  { value: "copywriter",   label: "Copywriter" },
  { value: "fotografo",    label: "Fotógrafo" },
  { value: "social_media", label: "Social Media" },
  { value: "outro",        label: "Outro" },
];

// ── Componente ────────────────────────────────────────────────────────────────

export function ContentParceirosPage() {
  const {
    partners, loading, invite, update, deactivate, reactivate, isInviting,
  } = usePartnerUsers();

  const [search,    setSearch]    = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [editItem,  setEditItem]  = useState<PartnerUser | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    slug: string; password?: string; login_key: string;
  } | null>(null);

  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) });

  const filtered = partners.filter(p =>
    !search.trim() ||
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.real_email.toLowerCase().includes(search.toLowerCase()),
  );

  const active   = filtered.filter(p => p.active);
  const inactive = filtered.filter(p => !p.active);

  async function handleInvite(values: InviteValues) {
    try {
      const result = await invite({
        email:        values.email,
        full_name:    values.full_name,
        specialty:    values.specialty as PartnerUser["specialty"],
        phone:        values.phone,
        partner_slug: values.partner_slug || undefined,
        password:     values.password || undefined,
      });
      setLastInvite({
        slug:     result.partner_slug,
        password: (result as Record<string, unknown>).generated_password as string | undefined,
        login_key: (result as Record<string, unknown>).login_key as string,
      });
      setShowForm(false);
      form.reset();
      toast.success("Parceiro convidado com sucesso");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao convidar parceiro");
    }
  }

  async function handleUpdate(values: InviteValues) {
    if (!editItem) return;
    try {
      await update({
        id:        editItem.id,
        full_name: values.full_name,
        specialty: values.specialty as PartnerUser["specialty"],
        phone:     values.phone,
      });
      setEditItem(null);
      toast.success("Parceiro atualizado");
    } catch {
      toast.error("Falha ao atualizar parceiro");
    }
  }

  function openEdit(partner: PartnerUser) {
    form.reset({
      email:     partner.real_email,
      full_name: partner.full_name ?? "",
      specialty: partner.specialty ?? "",
      phone:     partner.phone ?? "",
    });
    setEditItem(partner);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Parceiros</h1>
          <p className="text-sm text-muted-foreground">
            Terceirizados com acesso ao Portal Parceiro em{" "}
            <span className="font-mono text-xs">parceiro.c8control.com.br</span>
          </p>
        </div>
        <Button onClick={() => { form.reset(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />Convidar Parceiro
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-[300px]">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar parceiros..."
          className="pl-8"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
      ) : partners.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhum parceiro cadastrado</p>
          <p className="text-sm mt-1">
            Convide designers, videomakers e outros profissionais para acessar o Portal Parceiro.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />Convidar o primeiro parceiro
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ativos */}
          {active.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Ativos ({active.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {active.map(partner => (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    onEdit={openEdit}
                    onDeactivate={async id => {
                      await deactivate(id);
                      toast.success("Parceiro desativado");
                    }}
                    onReactivate={async id => {
                      await reactivate(id);
                      toast.success("Parceiro reativado");
                    }}
                    onCopySlug={slug => {
                      navigator.clipboard.writeText(slug);
                      toast.success("Slug copiado");
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inativos */}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Inativos ({inactive.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inactive.map(partner => (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    onEdit={openEdit}
                    onDeactivate={async id => { await deactivate(id); }}
                    onReactivate={async id => {
                      await reactivate(id);
                      toast.success("Parceiro reativado");
                    }}
                    onCopySlug={slug => {
                      navigator.clipboard.writeText(slug);
                      toast.success("Slug copiado");
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog — convidar */}
      <Dialog open={showForm} onOpenChange={v => !v && setShowForm(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Convidar Parceiro</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleInvite)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail *</FormLabel>
                  <FormControl><Input type="email" placeholder="designer@email.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo *</FormLabel>
                  <FormControl><Input placeholder="Ana Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="specialty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidade</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="">Não especificada</SelectItem>
                        {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input placeholder="(11) 99999-9999" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="partner_slug" render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug do parceiro</FormLabel>
                  <FormControl>
                    <Input placeholder="gerado automaticamente pelo nome" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Identificador único. Usado no login: email::slug
                  </p>
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha inicial</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Deixe vazio para gerar automaticamente" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={isInviting}>
                  {isInviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Convidar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog — editar */}
      <Dialog open={!!editItem} onOpenChange={v => !v && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Parceiro</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4">
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="specialty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidade</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={v => field.onChange(v || undefined)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="">Não especificada</SelectItem>
                        {SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog — credenciais geradas */}
      {lastInvite && (
        <Dialog open onOpenChange={() => setLastInvite(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Parceiro criado!</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Compartilhe estas credenciais com o parceiro:</p>
              <div className="bg-muted rounded-lg p-3 space-y-2 font-mono text-xs">
                <div><span className="text-muted-foreground">URL: </span>parceiro.c8control.com.br/{lastInvite.slug}</div>
                <div><span className="text-muted-foreground">Slug: </span>{lastInvite.slug}</div>
                <div><span className="text-muted-foreground">Login key: </span>{lastInvite.login_key}</div>
                {lastInvite.password && (
                  <div className="text-amber-600">
                    <span className="text-muted-foreground">Senha: </span>{lastInvite.password}
                    <span className="ml-2 text-[10px] font-sans text-amber-500">(anote agora — não será exibida novamente)</span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const text = `Portal Parceiro: parceiro.c8control.com.br/${lastInvite.slug}\nLogin: ${lastInvite.login_key}${lastInvite.password ? `\nSenha: ${lastInvite.password}` : ""}`;
                  navigator.clipboard.writeText(text);
                  toast.success("Credenciais copiadas");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-2" />Copiar credenciais
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── PartnerCard ───────────────────────────────────────────────────────────────

function PartnerCard({
  partner, onEdit, onDeactivate, onReactivate, onCopySlug,
}: {
  partner:      PartnerUser;
  onEdit:       (p: PartnerUser) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
  onCopySlug:   (slug: string) => void;
}) {
  const specialtyLabel = {
    designer:     "Designer",
    videomaker:   "Videomaker",
    copywriter:   "Copywriter",
    fotografo:    "Fotógrafo",
    social_media: "Social Media",
    outro:        "Outro",
  }[partner.specialty ?? ""] ?? null;

  return (
    <Card className={cn("border-border/60", !partner.active && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {!partner.active && (
                <Badge variant="outline" className="text-xs border-0 bg-gray-100 text-gray-500">Inativo</Badge>
              )}
              {specialtyLabel && (
                <Badge variant="secondary" className="text-xs">{specialtyLabel}</Badge>
              )}
            </div>
            <p className="font-medium text-sm truncate">{partner.full_name ?? "(sem nome)"}</p>
            <p className="text-xs text-muted-foreground truncate">{partner.real_email}</p>
            <button
              className="text-[11px] text-muted-foreground/70 hover:text-foreground flex items-center gap-1 mt-1"
              onClick={() => onCopySlug(partner.partner_slug)}
              title="Copiar slug"
            >
              <Copy className="h-2.5 w-2.5" />
              {partner.partner_slug}
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(partner)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopySlug(partner.partner_slug)}>
                <Copy className="h-3.5 w-3.5 mr-2" />Copiar slug
              </DropdownMenuItem>
              {partner.active ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDeactivate(partner.id)}
                >
                  <UserX className="h-3.5 w-3.5 mr-2" />Desativar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onReactivate(partner.id)}>
                  <UserCheck className="h-3.5 w-3.5 mr-2" />Reativar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {partner.last_seen_at && (
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            Último acesso: {format(parseISO(partner.last_seen_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
