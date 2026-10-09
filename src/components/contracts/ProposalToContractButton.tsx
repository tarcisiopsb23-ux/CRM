/**
 * ProposalToContractButton
 * Botão "Gerar Contrato" exibido em propostas com status "aprovada".
 * Importa os dados da proposta e abre o ContractGenerator
 * já preenchido com os dados do cliente e serviços.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileText, Loader2 } from "lucide-react";
import { useProposalToContract } from "@/hooks/useProposalToContract";
import { ContractGenerator } from "./ContractGenerator";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  proposalId: string;
  clientId: string;
  clientName: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}

export function ProposalToContractButton({
  proposalId, clientId, clientName, size = "sm", variant = "outline",
}: Props) {
  const organizationId = useOrganization();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Só busca quando o modal for aberto
  const { data: proposalData, isLoading } = useProposalToContract(
    open ? proposalId : undefined
  );

  const handleSuccess = (contractId: string) => {
    setOpen(false);
    toast.success("Contrato gerado! Acesse o módulo C8 Control → Clientes para visualizá-lo.", {
      duration: 6000,
      action: {
        label: "Ver contratos",
        onClick: () => navigate("/c8control?tab=tenants"),
      },
    });
  };

  return (
    <>
      <Button size={size} variant={variant} className="gap-1.5" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" />
        Gerar Contrato
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando dados da proposta...
            </div>
          ) : (
            <ContractGenerator
              clientId={clientId}
              clientName={proposalData?.client_name ?? clientName}
              clientCnpj={proposalData?.client_cnpj}
              clientAddress={proposalData?.client_address}
              organizationId={organizationId ?? ""}
              proposalId={proposalId}
              proposalData={proposalData ?? null}
              onSuccess={handleSuccess}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
