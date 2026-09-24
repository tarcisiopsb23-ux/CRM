import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export function useManagerPin() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const canHavePin = ["owner", "admin", "manager"].includes(profile?.role ?? "");

  // Check if current user has a PIN set
  const { data: hasPin = false, isLoading } = useQuery({
    queryKey: ["manager_pin_exists", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_manager_pin");
      if (error) return false;
      return data as boolean;
    },
    enabled: !!profile?.id && canHavePin,
  });

  // Set or update PIN
  const setPin = useMutation({
    mutationFn: async (pin: string) => {
      const { data, error } = await supabase.rpc("set_manager_pin", { p_pin: pin });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error ?? "Erro ao salvar PIN");
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager_pin_exists", profile?.id] });
    },
  });

  // Verify PIN (returns boolean)
  const verifyPin = async (pin: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("verify_manager_pin", { p_pin: pin });
    if (error) return false;
    return data as boolean;
  };

  return { hasPin, isLoading, canHavePin, setPin, verifyPin };
}
