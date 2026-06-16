import { ImageIcon, Video, Phone, MousePointerClick } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Proposal } from "@/types/proposals";

type HeroFields = Pick<Proposal,
  | "hero_logo_url" | "hero_title" | "hero_subtitle" | "hero_message"
  | "hero_video_url" | "hero_image_url"
  | "hero_whatsapp_text" | "hero_whatsapp_number"
  | "hero_cta_text" | "hero_cta_color"
>;

interface Props {
  values: Partial<HeroFields>;
  onChange: (updated: Partial<HeroFields>) => void;
}

export function PropostaHeroEditor({ values, onChange }: Props) {
  const set = (key: keyof HeroFields, value: string) => onChange({ ...values, [key]: value });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" /> Bloco Hero
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>URL do Logotipo</Label>
            <div className="flex gap-2">
              <ImageIcon className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
              <Input placeholder="https://..." value={values.hero_logo_url ?? ""} onChange={e => set("hero_logo_url", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>URL da Imagem de Destaque</Label>
            <div className="flex gap-2">
              <ImageIcon className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
              <Input placeholder="https://..." value={values.hero_image_url ?? ""} onChange={e => set("hero_image_url", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Título *</Label>
          <Input placeholder="Título principal da proposta" value={values.hero_title ?? ""} onChange={e => set("hero_title", e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Subtítulo</Label>
          <Input placeholder="Subtítulo opcional" value={values.hero_subtitle ?? ""} onChange={e => set("hero_subtitle", e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Mensagem personalizada</Label>
          <Textarea rows={3} placeholder="Mensagem de abertura para o cliente..." value={values.hero_message ?? ""} onChange={e => set("hero_message", e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>URL do Vídeo (embed)</Label>
          <div className="flex gap-2">
            <Video className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
            <Input placeholder="https://youtube.com/embed/..." value={values.hero_video_url ?? ""} onChange={e => set("hero_video_url", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Texto do botão WhatsApp</Label>
            <Input placeholder="Falar no WhatsApp" value={values.hero_whatsapp_text ?? ""} onChange={e => set("hero_whatsapp_text", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Número WhatsApp</Label>
            <Input placeholder="5511999999999" value={values.hero_whatsapp_number ?? ""} onChange={e => set("hero_whatsapp_number", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Texto do botão CTA</Label>
            <Input placeholder="Aprovar Proposta" value={values.hero_cta_text ?? ""} onChange={e => set("hero_cta_text", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cor do botão CTA</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={values.hero_cta_color ?? "#16a34a"} onChange={e => set("hero_cta_color", e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
              <Input value={values.hero_cta_color ?? "#16a34a"} onChange={e => set("hero_cta_color", e.target.value)} className="font-mono text-sm" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
