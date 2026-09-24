import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import { useRecruitmentConfig } from "@/hooks/useRecruitmentConfig";
import type { RecruitmentConfig } from "@/types/recruitment";

export function RecruitmentSection() {
  const orgId = useOrganization();
  const { config, isLoading, save } = useRecruitmentConfig(orgId);

  const [form, setForm] = useState<RecruitmentConfig>({
    drive_folder_id: "",
    drive_folder_url: "",
    drive_webhook_url: "",
    notification_email: "",
    auto_notify: false,
  });
  const [saving, setSaving] = useState(false);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized && (
      config.drive_folder_id ||
      config.drive_folder_url ||
      config.drive_webhook_url ||
      config.notification_email ||
      config.auto_notify !== undefined
    )) {
      setInitialized(true);
      setForm({
        drive_folder_id:    config.drive_folder_id    ?? "",
        drive_folder_url:   config.drive_folder_url   ?? "",
        drive_webhook_url:  config.drive_webhook_url  ?? "",
        notification_email: config.notification_email ?? "",
        auto_notify:        config.auto_notify        ?? false,
      });
    }
  }, [config, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save.mutateAsync(form);
      toast.success("Configurações de recrutamento salvas.");
    } catch {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const driveNotConfigured = !form.drive_folder_id?.trim();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {driveNotConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-600">Pasta do Drive não configurada</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure a pasta do Google Drive para que os currículos sejam arquivados automaticamente.
              Candidaturas ainda serão recebidas, mas sem o currículo no Drive.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Drive — Currículos</CardTitle>
          <CardDescription>
            Pasta onde os currículos dos candidatos serão arquivados automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>ID da pasta raiz de currículos</Label>
            <Input
              value={form.drive_folder_id ?? ""}
              onChange={(e) => setForm({ ...form, drive_folder_id: e.target.value })}
              placeholder="Ex: 1abc2def3ghi..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              ID da pasta no Google Drive onde os currículos serão organizados por vaga.
            </p>
          </div>
          <div>
            <Label>URL da pasta (opcional)</Label>
            <Input
              value={form.drive_folder_url ?? ""}
              onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value })}
              placeholder="https://drive.google.com/drive/folders/..."
            />
          </div>
          <div>
            <Label>Webhook n8n para upload</Label>
            <Input
              value={form.drive_webhook_url ?? ""}
              onChange={(e) => setForm({ ...form, drive_webhook_url: e.target.value })}
              placeholder="https://n8n.dominio.com/webhook/drive-folder-manual"
            />
            <p className="text-xs text-muted-foreground mt-1">
              URL do webhook de Drive do n8n para fazer upload dos currículos.
              Deixe em branco para usar o webhook padrão configurado em Integrações → n8n.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificações</CardTitle>
          <CardDescription>
            Receba alertas quando uma nova candidatura for recebida.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>E-mail de notificação</Label>
            <Input
              type="email"
              value={form.notification_email ?? ""}
              onChange={(e) => setForm({ ...form, notification_email: e.target.value })}
              placeholder="rh@agenciac8.com.br"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Notificação automática</p>
              <p className="text-xs text-muted-foreground">
                Enviar e-mail ao receber nova candidatura
              </p>
            </div>
            <Switch
              checked={form.auto_notify ?? false}
              onCheckedChange={(v) => setForm({ ...form, auto_notify: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Salvar configurações
      </Button>
    </div>
  );
}
