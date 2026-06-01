import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CreditCard, QrCode, FileText, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { useAsaasCharges, type AsaasBillingType, type CardData } from "@/hooks/useAsaasCharges";
import { formatBRL } from "@/lib/formatters";
import { toast } from "sonner";

interface AsaasChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    description: string;
    value: number;
    due_date: string;
    client: {
      name: string;
      email: string;
      document: string;
      phone?: string;
    };
  };
}

export function AsaasChargeDialog({ open, onOpenChange, payment }: AsaasChargeDialogProps) {
  const [billingType, setBillingType] = useState<AsaasBillingType>("pix");
  const [customExpirationDays, setCustomExpirationDays] = useState<number>(3);
  const [cardData, setCardData] = useState<CardData>({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: ""
  });
  const [showCardForm, setShowCardForm] = useState(false);
  const [generatedCharge, setGeneratedCharge] = useState<any>(null);

  const { createCharge, isCreating } = useAsaasCharges(undefined, { enabled: false });

  const handleGenerateCharge = async () => {
    try {
      const cardDataToSubmit = billingType === "credit_card" ? cardData : undefined;

      const result = await createCharge.mutateAsync({
        payment_id: payment.id,
        billing_type: billingType,
        card_data: cardDataToSubmit,
        custom_expiration_days: customExpirationDays
      });

      setGeneratedCharge(result);
    } catch (error) {
      // Erro já tratado no hook
    }
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch (error) {
      toast.error("Erro ao copiar");
    }
  };

  const resetForm = () => {
    setBillingType("pix");
    setCustomExpirationDays(3);
    setCardData({
      holderName: "",
      number: "",
      expiryMonth: "",
      expiryYear: "",
      cvv: ""
    });
    setShowCardForm(false);
    setGeneratedCharge(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const validateCardData = (): boolean => {
    if (billingType !== "credit_card") return true;
    
    return (
      cardData.holderName.trim() !== "" &&
      cardData.number.replace(/\s/g, "").length >= 16 &&
      cardData.expiryMonth !== "" &&
      cardData.expiryYear !== "" &&
      cardData.cvv.length >= 3
    );
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(" ");
  };

  const getBillingTypeIcon = (type: AsaasBillingType) => {
    switch (type) {
      case "pix": return <QrCode className="h-4 w-4" />;
      case "boleto": return <FileText className="h-4 w-4" />;
      case "credit_card": return <CreditCard className="h-4 w-4" />;
    }
  };

  const getBillingTypeLabel = (type: AsaasBillingType) => {
    switch (type) {
      case "pix": return "PIX";
      case "boleto": return "Boleto";
      case "credit_card": return "Cartão de Crédito";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar Cobrança Asaas</DialogTitle>
        </DialogHeader>

        {!generatedCharge ? (
          <div className="space-y-6">
            {/* Informações do Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados do Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Descrição</Label>
                    <p className="font-medium">{payment.description}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Valor</Label>
                    <p className="font-medium text-lg">{formatBRL(payment.value)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Vencimento</Label>
                    <p className="font-medium">{new Date(payment.due_date).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Cliente</Label>
                    <p className="font-medium">{payment.client.name}</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Email: {payment.client.email}</p>
                  <p>CPF/CNPJ: {payment.client.document}</p>
                  {payment.client.phone && <p>Telefone: {payment.client.phone}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Método de Pagamento */}
            <div>
              <Label className="text-base font-medium">Método de Pagamento</Label>
              <RadioGroup
                value={billingType}
                onValueChange={(value: AsaasBillingType) => setBillingType(value)}
                className="mt-3"
              >
                <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="pix" id="pix" />
                  <Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer">
                    <QrCode className="h-4 w-4" />
                    <span>PIX</span>
                    <Badge variant="secondary">Imediato</Badge>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="boleto" id="boleto" />
                  <Label htmlFor="boleto" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="h-4 w-4" />
                    <span>Boleto</span>
                    <Badge variant="secondary">Até 5 dias</Badge>
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="credit_card" id="credit_card" />
                  <Label htmlFor="credit_card" className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="h-4 w-4" />
                    <span>Cartão de Crédito</span>
                    <Badge variant="secondary">Imediato</Badge>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Dados do Cartão */}
            {billingType === "credit_card" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dados do Cartão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="holderName">Nome no Cartão</Label>
                    <Input
                      id="holderName"
                      value={cardData.holderName}
                      onChange={(e) => setCardData({ ...cardData, holderName: e.target.value })}
                      placeholder="Como está impresso no cartão"
                    />
                  </div>
                  <div>
                    <Label htmlFor="number">Número do Cartão</Label>
                    <Input
                      id="number"
                      value={cardData.number}
                      onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                      placeholder="0000 0000 0000 0000"
                      maxLength={19}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="expiryMonth">Mês</Label>
                      <Select value={cardData.expiryMonth} onValueChange={(value) => setCardData({ ...cardData, expiryMonth: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>
                              {String(i + 1).padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="expiryYear">Ano</Label>
                      <Select value={cardData.expiryYear} onValueChange={(value) => setCardData({ ...cardData, expiryYear: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="AA" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, i) => {
                            const year = new Date().getFullYear() + i;
                            return (
                              <SelectItem key={year} value={String(year)}>
                                {year}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        value={cardData.cvv}
                        onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '') })}
                        placeholder="123"
                        maxLength={4}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Configurações Adicionais */}
            <div>
              <Label htmlFor="expirationDays">Vencimento (dias)</Label>
              <Select value={String(customExpirationDays)} onValueChange={(value) => setCustomExpirationDays(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="5">5 dias</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="15">15 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {billingType === "credit_card" && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Os dados do cartão são processados de forma segura através da API Asaas e não são armazenados em nossos servidores.
                </AlertDescription>
              </Alert>
          )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleGenerateCharge}
                disabled={isCreating || (billingType === "credit_card" && !validateCardData())}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    {getBillingTypeIcon(billingType)}
                    Gerar Cobrança {getBillingTypeLabel(billingType)}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Resultado da Cobrança Gerada */
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                {getBillingTypeIcon(billingType)}
              </div>
              <h3 className="text-lg font-semibold">Cobrança Gerada!</h3>
              <p className="text-muted-foreground">ID: {generatedCharge.asaas_id}</p>
            </div>

            <Separator />

            {/* PIX */}
            {billingType === "pix" && generatedCharge.pix_qr_code && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    PIX
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <img
                      src={`data:image/png;base64,${generatedCharge.pix_qr_code}`}
                      alt="QR Code PIX"
                      className="mx-auto max-w-48"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código PIX</Label>
                    <div className="flex gap-2">
                      <Input
                        value={generatedCharge.payment_url || ""}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyToClipboard(generatedCharge.payment_url || "", "Código PIX")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {generatedCharge.pix_expiration_date && (
                    <p className="text-sm text-muted-foreground">
                      Expira em: {new Date(generatedCharge.pix_expiration_date).toLocaleString('pt-BR')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Boleto */}
            {billingType === "boleto" && generatedCharge.boleto_url && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Boleto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Link do Boleto</Label>
                    <div className="flex gap-2">
                      <Input
                        value={generatedCharge.boleto_url}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyToClipboard(generatedCharge.boleto_url, "Link do Boleto")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => window.open(generatedCharge.boleto_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {generatedCharge.boleto_barcode && (
                    <div className="space-y-2">
                      <Label>Código de Barras</Label>
                      <div className="flex gap-2">
                        <Input
                          value={generatedCharge.boleto_barcode}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyToClipboard(generatedCharge.boleto_barcode, "Código de Barras")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {generatedCharge.boleto_expiration_date && (
                    <p className="text-sm text-muted-foreground">
                      Vencimento: {new Date(generatedCharge.boleto_expiration_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Cartão */}
            {billingType === "credit_card" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Cartão de Crédito
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Pagamento processado com sucesso
                    </p>
                    {generatedCharge.card_last_digits && (
                      <p className="font-mono">
                        **** **** **** {generatedCharge.card_last_digits}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
