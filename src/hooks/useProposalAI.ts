import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SectionKey } from "@/types/proposals";

export interface AIGenerateContext {
  sectionKey: SectionKey | "contrato" | "followup" | "whatsapp" | "email";
  clientName: string;
  company: string;
  niche?: string;
  services: Array<{ name: string; value: number }>;
}

export interface UseProposalAIReturn {
  isLoading: boolean;
  result: string | null;
  error: string | null;
  generateSection: (context: AIGenerateContext) => Promise<void>;
  reset: () => void;
}

export function useProposalAI(): UseProposalAIReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateSection = async (context: AIGenerateContext) => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    const TIMEOUT_MS = 30_000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const { data, error: fnError } = await supabase.functions.invoke("proposal-ai-generate", {
        body: context,
      });

      clearTimeout(timeoutId);

      if (fnError) throw fnError;
      setResult((data as Record<string, unknown>)?.text as string ?? "");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Não foi possível gerar o conteúdo. Tente novamente ou preencha manualmente.");
      } else {
        setError("Não foi possível gerar o conteúdo. Tente novamente ou preencha manualmente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { isLoading, result, error, generateSection, reset };
}
