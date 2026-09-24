// src/components/contracts/GenerateContractButton.tsx
// Requirements: 4.5, 4.6, 9.1, 9.8

import { FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useContractAssembly } from "@/hooks/useContractAssembly";
import { ReviewModal } from "@/components/contracts/ReviewModal";

interface GenerateContractButtonProps {
  contractId: string;
  organizationId: string;
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
  } = useContractAssembly(contractId);

  const handleClick = () => {
    openReview();
  };

  return (
    <>
      <Button onClick={handleClick}>
        <FileText className="h-4 w-4 mr-2" />
        Gerar Contrato
      </Button>

      {/* Req 9.3: ReviewModal is rendered conditionally when isReviewOpen */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        assembledResult={assembledResult}
        clauseEdits={clauseEdits}
        onEditClause={editClause}
        onConfirmGenerate={confirmGenerate}
      />
    </>
  );
}
