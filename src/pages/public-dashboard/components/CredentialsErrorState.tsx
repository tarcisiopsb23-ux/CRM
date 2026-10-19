import { AlertCircle } from "lucide-react";

export function CredentialsErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <AlertCircle className="h-12 w-12 text-yellow-400" />
      <h2 className="text-xl font-semibold text-foreground">
        Credenciais não configuradas
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Para acessar o Conteúdo IA, o administrador precisa configurar a URL e a
        chave anônima do Supabase do estabelecimento. Acesse o cadastro do
        cliente no CRM, vá até a aba <strong className="text-foreground/90">Integrações</strong> e
        preencha os campos de credenciais do Supabase na seção "Conteúdo IA".
      </p>
    </div>
  );
}
