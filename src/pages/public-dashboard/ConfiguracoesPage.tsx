import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Building2, Plus, Trash2, ImagePlus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeSlot {
  open: string;
  close: string;
}

interface OpeningHoursStructured {
  [day: string]: TimeSlot[] | null;
}

interface AiSettings {
  id?: string;
  phone: string;
  instagram: string;
  address: string;
  opening_hours: string;
  sidebar_logo_url?: string | null;
  updated_at?: string;
}

type FormValues = Omit<AiSettings, "id" | "updated_at" | "sidebar_logo_url">;

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { key: "seg", label: "Segunda-feira" },
  { key: "ter", label: "Terça-feira" },
  { key: "qua", label: "Quarta-feira" },
  { key: "qui", label: "Quinta-feira" },
  { key: "sex", label: "Sexta-feira" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

const DEFAULT_SLOT: TimeSlot = { open: "09:00", close: "18:00" };

const DEFAULT_HOURS: OpeningHoursStructured = {
  seg: [{ ...DEFAULT_SLOT }],
  ter: [{ ...DEFAULT_SLOT }],
  qua: [{ ...DEFAULT_SLOT }],
  qui: [{ ...DEFAULT_SLOT }],
  sex: [{ ...DEFAULT_SLOT }],
  sab: null,
  dom: null,
};

const defaultValues: FormValues = {
  phone: "",
  instagram: "",
  address: "",
  opening_hours: JSON.stringify(DEFAULT_HOURS),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHours(raw: string | undefined | null): OpeningHoursStructured {
  if (!raw) return DEFAULT_HOURS;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      const migrated: OpeningHoursStructured = {};
      for (const key of Object.keys(parsed)) {
        const v = parsed[key];
        if (v === null) {
          migrated[key] = null;
        } else if (Array.isArray(v)) {
          migrated[key] = v;
        } else if (typeof v === "object" && "open" in v && "close" in v) {
          migrated[key] = [{ open: v.open, close: v.close }];
        } else {
          migrated[key] = null;
        }
      }
      return migrated;
    }
  } catch {
    // texto livre — retorna padrão
  }
  return DEFAULT_HOURS;
}

// ─── Componente de horários ───────────────────────────────────────────────────

interface OpeningHoursSelectorProps {
  value: OpeningHoursStructured;
  onChange: (v: OpeningHoursStructured) => void;
}

function OpeningHoursSelector({ value, onChange }: OpeningHoursSelectorProps) {
  const toggleDay = (key: string, checked: boolean) => {
    onChange({ ...value, [key]: checked ? [{ open: "09:00", close: "18:00" }] : null });
  };

  const addSlot = (key: string) => {
    const slots = value[key] ?? [];
    onChange({ ...value, [key]: [...slots, { open: "09:00", close: "18:00" }] });
  };

  const removeSlot = (key: string, index: number) => {
    const slots = (value[key] ?? []).filter((_, i) => i !== index);
    onChange({ ...value, [key]: slots.length > 0 ? slots : null });
  };

  const updateSlot = (key: string, index: number, field: "open" | "close", time: string) => {
    const slots = [...(value[key] ?? [])];
    slots[index] = { ...slots[index], [field]: time };
    onChange({ ...value, [key]: slots });
  };

  return (
    <div className="grid gap-3">
      {DAYS_OF_WEEK.map(({ key, label }) => {
        const slots = value[key] ?? null;
        const isOpen = slots !== null;

        return (
          <div key={key} className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-36 shrink-0">
                <Checkbox
                  id={`day-${key}`}
                  checked={isOpen}
                  onCheckedChange={(checked) => toggleDay(key, !!checked)}
                />
                <label htmlFor={`day-${key}`} className="text-sm font-medium cursor-pointer select-none">
                  {label}
                </label>
              </div>

              {!isOpen && <span className="text-xs text-muted-foreground italic">Fechado</span>}

              {isOpen && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => addSlot(key)}
                >
                  <Plus className="h-3 w-3" />
                  Adicionar horário
                </Button>
              )}
            </div>

            {isOpen && slots && slots.length > 0 && (
              <div className="mt-3 grid gap-2 pl-6">
                {slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Abre</Label>
                      <Input
                        type="time"
                        value={slot.open}
                        onChange={(e) => updateSlot(key, idx, "open", e.target.value)}
                        className="h-8 w-28 text-sm"
                      />
                    </div>
                    <span className="text-muted-foreground text-xs">até</span>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Fecha</Label>
                      <Input
                        type="time"
                        value={slot.close}
                        onChange={(e) => updateSlot(key, idx, "close", e.target.value)}
                        className="h-8 w-28 text-sm"
                      />
                    </div>
                    {slots.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSlot(key, idx)}
                        title="Remover período"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente de upload do logo ─────────────────────────────────────────────

interface LogoUploaderProps {
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
  dc: ReturnType<typeof useDynamicClient>;
}

function LogoUploader({ currentUrl, onUploaded, dc }: LogoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  // Sincroniza preview quando currentUrl muda (ex: ao carregar settings)
  useEffect(() => {
    setPreview(currentUrl);
  }, [currentUrl]);

  const handleFile = async (file: File) => {
    if (!dc) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const BUCKET = "branding";
      const filePath = `sidebar-logo/${Date.now()}.${ext}`;

      const { error: uploadError } = await dc.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Bucket não existe ou sem permissão — orienta o usuário
        if (uploadError.message.includes("Bucket not found") || uploadError.statusCode === "404" || (uploadError as any).status === 400) {
          throw new Error(
            'Bucket "branding" não encontrado. Execute o SQL de migration no Supabase do cliente para criá-lo.'
          );
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = dc.storage.from(BUCKET).getPublicUrl(filePath);

      setPreview(publicUrl);
      onUploaded(publicUrl);
      toast.success("Ícone carregado. Salve para confirmar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUploaded(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-4">
      {/* Preview */}
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/40 overflow-hidden">
        {preview ? (
          <>
            <img src={preview} alt="Ícone do sidebar" className="h-full w-full object-contain p-1" />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
              title="Remover ícone"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="border-border"
        >
          {uploading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Enviando...</>
          ) : (
            <><ImagePlus className="h-3.5 w-3.5 mr-2" />{preview ? "Trocar imagem" : "Enviar imagem"}</>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground">PNG, JPG ou SVG · máx. 2 MB</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ConfiguracoesPage() {
  const dc = useDynamicClient();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ defaultValues });

  const [hours, setHours] = useState<OpeningHoursStructured>(DEFAULT_HOURS);
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState<string | null>(null);

  // ⚠️ Todos os hooks ANTES de qualquer return condicional
  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai_settings"],
    queryFn: async () => {
      if (!dc) return null;
      const { data, error } = await dc.from("ai_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as AiSettings | null;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        phone: settings.phone ?? "",
        instagram: settings.instagram ?? "",
        address: settings.address ?? "",
        opening_hours: settings.opening_hours ?? "",
      });
      setHours(parseHours(settings.opening_hours));
      setSidebarLogoUrl(settings.sidebar_logo_url ?? null);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async ({ values, currentHours, currentLogoUrl }: {
      values: FormValues;
      currentHours: OpeningHoursStructured;
      currentLogoUrl: string | null;
    }) => {
      if (!dc) throw new Error("Cliente não conectado");

      const payload: Record<string, unknown> = {
        phone: values.phone,
        instagram: values.instagram,
        address: values.address,
        opening_hours: JSON.stringify(currentHours),
        sidebar_logo_url: currentLogoUrl,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        const { error } = await dc
          .from("ai_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await dc.from("ai_settings").insert(payload);
        if (error) throw error;
      }

      // Retorna o payload salvo para atualizar o cache sem refetch
      return { ...settings, ...payload } as AiSettings;
    },
    onSuccess: (saved) => {
      toast.success("Configurações salvas com sucesso!");
      // Atualiza o cache diretamente — evita refetch que sobrescreveria o estado local
      queryClient.setQueryData(["ai_settings"], saved);
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
  });

  // Guards após todos os hooks
  if (!dc) return <CredentialsErrorState />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSubmit = form.handleSubmit((values) => {
    saveMutation.mutate({
      values,
      currentHours: hours,
      currentLogoUrl: sidebarLogoUrl,
    });
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Informações do estabelecimento comunicadas aos clientes."
      />

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">

          {/* ── Estabelecimento ── */}
          <Card className="card-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Estabelecimento
              </CardTitle>
              <CardDescription>Informações públicas comunicadas aos clientes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {/* Contato */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Telefone</Label>
                  <Input {...form.register("phone")} placeholder="Ex: (11) 99999-9999" />
                </div>
                <div className="grid gap-2">
                  <Label>Instagram</Label>
                  <Input {...form.register("instagram")} placeholder="Ex: @seuestablecimento" />
                </div>
              </div>

              {/* Endereço */}
              <div className="grid gap-2">
                <Label>Endereço</Label>
                <Input
                  {...form.register("address")}
                  placeholder="Ex: Rua das Flores, 123 — São Paulo, SP"
                />
              </div>

              {/* Horários de funcionamento */}
              <div className="grid gap-3">
                <Label>Horário de funcionamento</Label>
                <OpeningHoursSelector value={hours} onChange={setHours} />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="bg-gradient-ember text-primary-foreground shadow-glow"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar alterações
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </form>
    </div>
  );
}
