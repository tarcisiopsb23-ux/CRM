// src/components/contracts/GenerateContractButton.tsx
// Requirements: 4.5, 4.6, 9.1, 9.8

import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useContractAssembly } from "@/hooks/useContractAssembly";
import { ReviewModal } from "@/components/contracts/ReviewModal";

interface GenerateContractButtonProps {
  contractId: string;
  organizationId: string;
  /** Chamado após geração bem-sucedida — ex: navegar para o viewer */
  onGenerated?: () => void;
}

/**
 * Button that triggers the contract assembly + review flow.
 *
 * On click:
 *  - If the template has no `structure` configured, shows a toast error (Req 9.8).
 *  - Otherwise opens the ReviewModal with the assembled result (Req 9.1).
 */
export function GenerateContractButton({
  contractId,
  // organizationId is available for future use (e.g. fetching org-scoped data)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  organizationId: _organizationId,
  onGenerated,
}: GenerateContractButtonProps) {
  const {
    isReviewOpen,
    setIsReviewOpen,
    assembledResult,
    assemblyError,
    clauseEdits,
    editClause,
    confirmGenerate,
    openReview,
    isAssembling,
    template,
  } = useContractAssembly(contractId);

  const handleClick = () => {
    if (!contractId) return;
    openReview();
  };

  const handleConfirmGenerate = async () => {
    await confirmGenerate();
    onGenerated?.();
  };

  return (
    <>
      <Button onClick={handleClick} disabled={isAssembling} className="gap-2">
        {isAssembling
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Montando...</>
          : <><FileText className="h-4 w-4" /> Gerar Contrato</>
        }
      </Button>

      {/* Req 9.3: ReviewModal is rendered conditionally when isReviewOpen */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        assembledResult={assembledResult}
        clauseEdits={clauseEdits}
        onEditClause={editClause}
        onConfirmGenerate={handleConfirmGenerate}
        template={template}
      />
    </>
  );
}
