import { useContext } from "react";
import { ClientAuthContext } from "@/contexts/ClientAuthContext";

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error("useClientAuth deve ser usado dentro de ClientAuthProvider");
  return ctx;
}
