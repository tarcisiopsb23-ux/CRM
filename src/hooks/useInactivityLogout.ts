/**
 * useInactivityLogout
 *
 * Monitora atividade do usuário (mouse, teclado, scroll, touch).
 * Após TIMEOUT_MS de inatividade, faz signOut e redireciona para /login.
 *
 * Só ativa quando há sessão autenticada.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/hooks/useAuth";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

export function useInactivityLogout() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await supabaseAuth.auth.signOut();
        navigate("/login?reason=inatividade");
      }, TIMEOUT_MS);
    };

    // Inicia o timer imediatamente
    reset();

    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [session, navigate]);
}
