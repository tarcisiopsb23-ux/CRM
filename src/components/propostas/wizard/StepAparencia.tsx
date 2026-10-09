// src/components/propostas/wizard/StepAparencia.tsx
// Step 2 do wizard: configuração completa da aparência (hero) da proposta.
// Reutiliza PropostaHeroEditor que já existe no editor pós-criação.
// Pré-preenchido com os valores do template da organização.

import { Info } from "lucide-react";
import { PropostaHeroEditor } from "@/components/propostas/PropostaHeroEditor";
import type { Proposal } from "@/types/proposals";

type HeroFields = Pick<
  Proposal,
  | "hero_logo_url"
  | "hero_title"
  | "hero_subtitle"
  | "hero_message"
  | "hero_video_url"
  | "hero_image_url"
  | "hero_whatsapp_text"
  | "hero_whatsapp_number"
  | "hero_cta_text"
  | "hero_cta_color"
>;

interface Props {
  clientName: string;
  values: Partial<HeroFields>;
  onChange: (updated: Partial<HeroFields>) => void;
}

export function StepAparencia({ clientName, values, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Aparência da proposta</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Personalize a capa e o visual que <strong>{clientName}</strong> verá ao abrir o link.
        </p>
      </div>

      {/* Dica sobre o template */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Os campos abaixo foram pré-preenchidos com o template padrão da organização.
          Personalize apenas o que for diferente para esta proposta — logo, WhatsApp do closer e mensagem de abertura são os mais comuns.
        </p>
      </div>

      <PropostaHeroEditor values={values} onChange={onChange} />
    </div>
  );
}
