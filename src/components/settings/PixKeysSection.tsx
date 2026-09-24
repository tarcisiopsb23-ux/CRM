/**
 * PixKeysSection
 * Gerenciamento de chaves PIX da organização.
 * Visível apenas para owner/admin (verificado via useAuth + RLS).
 */
import { useState } from "react";
import { Plus, Star, Pencil, Trash2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyMask } from "@/lib/masks";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { usePixKeys, PIX_KEY_TYPE_LABELS } from "@/hooks/usePixKeys";
import type { PixKey, PixKeyInput } from "@/hooks/usePixKeys";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------

const EMPTY_FORM: PixKeyInput = {
  label:       "",
  key_type:    "cnpj",
  key_value:   "",
  holder_name: "",
  is_default:  false,
  is_active:   true,
};

export function PixKeysSection() {
  const { profile } = useAuth();
  const isAdminOrOwner = profile?.role === "owner" || profile?.role === "admin";

  const { pixKeys, isLoading, create, update, remove, setDefault } = usePixKeys();

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editing, setEditing]           = useState<PixKey | null>(null);
  const [form, setForm]                 = useState<PixKeyInput>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<PixKey | null>(null);

  if (!isAdminOrOwner) return null;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (key: PixKey) => {
    setEditing(key);
    setForm({
      label:       key.label,
      key_type:    key.key_type,
      key_value:   key.key_value,
      holder_name: key.holder_name,
      is_default:  key.is_default,
      is_active:   key.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.key_value.trim() || !form.holder_name.trim()) return;
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...form });
    } else {
      await create.mutateAsync(form);
    }
    setDialogOpen(false);
  };

  const isBusy = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Chaves PIX</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chaves PIX da agência disponíveis para uso nos contratos.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova chave PIX
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : pixKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
          Nenhuma chave PIX cadastrada.
        </p>
      ) : (
        <div className="space-y-2">
          {pixKeys.map(key => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {key.is_default && (
                  <Star className="h-4 w-4 text-yellow-500 shrink-0" fill="currentColor" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{key.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {PIX_KEY_TYPE_LABELS[key.key_type]}
                    </Badge>
                    {key.is_default && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 border-yellow-200">
                        Padrão
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {key.key_value}{key.holder_name ? ` — ${key.holder_name}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!key.is_default && (
                  <Button
                    size="sm" variant="ghost"
                    title="Definir como padrão"
                    onClick={() => setDefault.mutateAsync(key.id)}
                    disabled={setDefault.isPending}
                    className="text-muted-foreground hover:text-yellow-600"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm" variant="ghost"
                  onClick={() => openEdit(key)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setDeleteTarget(key)}
                  className="text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dialog criar/editar ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!isBusy) setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar chave PIX" : "Nova chave PIX"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Identificação *</Label>
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Ex: CNPJ Principal, E-mail Financeiro"
              />
            </div>

            <div className="space-y-1">
              <Label>Nome do titular *</Label>
              <Input
                value={form.holder_name}
                onChange={e => setForm(f => ({ ...f, holder_name: e.target.value }))}
                placeholder="Ex: Agência C8 LTDA"
              />
              <p className="text-[11px] text-muted-foreground">
                Nome que aparecerá no contrato junto com a chave PIX.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de chave *</Label>
                <Select
                  value={form.key_type}
                  onValueChange={v => setForm(f => ({ ...f, key_type: v as PixKey["key_type"], key_value: "" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PIX_KEY_TYPE_LABELS) as [PixKey["key_type"], string][]).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Valor da chave *</Label>
                <Input
                  value={form.key_value}
                  onChange={e => {
                    const raw = e.target.value;
                    const masked =
                      form.key_type === "cnpj"
                        ? applyMask(raw, "cnpj")
                        : form.key_type === "cpf"
                        ? applyMask(raw, "cpf")
                        : raw;
                    setForm(f => ({ ...f, key_value: masked }));
                  }}
                  inputMode={form.key_type === "cnpj" || form.key_type === "cpf" ? "numeric" : "text"}
                  placeholder={
                    form.key_type === "cnpj"      ? "00.000.000/0001-00" :
                    form.key_type === "cpf"       ? "000.000.000-00" :
                    form.key_type === "email"     ? "financeiro@empresa.com" :
                    form.key_type === "telefone"  ? "+55 (00) 00000-0000" :
                    "Chave aleatória (32 dígitos)"
                  }
                  maxLength={
                    form.key_type === "cnpj"      ? 18 :
                    form.key_type === "cpf"       ? 14 :
                    form.key_type === "email"     ? 100 : 50
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pix-default"
                checked={form.is_default}
                onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="pix-default" className="cursor-pointer text-sm font-normal">
                Definir como chave padrão para novos contratos
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isBusy}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isBusy || !form.label.trim() || !form.key_value.trim() || !form.holder_name.trim()}
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alert remover ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave PIX?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>{deleteTarget?.label}</strong> ({deleteTarget?.key_value}) será removida.
              Contratos já gerados não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { remove.mutateAsync(deleteTarget!.id); setDeleteTarget(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
