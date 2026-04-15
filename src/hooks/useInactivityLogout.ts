/**
 * useInactivityLogout
 *
 * Monitora atividade do usuário. Após TIMEOUT_MS de inatividade, faz signOut.
 * mousemove e scroll são debounced (250ms) para evitar thrashing de CPU.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/hooks/useAuth";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const DEBOUNCE_MS = 250;

// Eventos de alta frequência — debounced
const DEBOUNCED_EVENTS = ["mousemove", "scroll", "touchmove"];
// Eventos discretos — sem debounce
const DIRECT_EVENTS    = ["mousedown", "keydown", "touchstart", "click"];

export function useInactivityLogout() {
  const { session } = useAuth();
  const navigate    = useNavigate();
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await supabaseAuth.auth.signOut();
        navigate("/login?reason=inatividade");
      }, TIMEOUT_MS);
    };

    const debouncedReset = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(resetTimer, DEBOUNCE_MS);
    };

    resetTimer(); // inicia o timer

    DEBOUNCED_EVENTS.forEach(e => window.addEventListener(e, debouncedReset, { passive: true }));
    DIRECT_EVENTS.forEach(e   => window.addEventListener(e, resetTimer,     { passive: true }));

    return () => {
      if (timerRef.current)    clearTimeout(timerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      DEBOUNCED_EVENTS.forEach(e => window.removeEventListener(e, debouncedReset));
      DIRECT_EVENTS.forEach(e    => window.removeEventListener(e, resetTimer));
    };
  }, [session, navigate]);
}
