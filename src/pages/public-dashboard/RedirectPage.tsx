/**
 * Página de redirecionamento instantâneo.
 * Rota: /r?to=<url_encoded_destination>
 *
 * Uso: Gerada pelo ConfiguracoesPage apenas client-side.
 * Não salva nada no banco — a URL já carrega o destino codificada.
 * Redireciona em <1 frame, praticamente invisível ao usuário.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function RedirectPage() {
  const [params] = useSearchParams();
  const to = params.get("to");

  useEffect(() => {
    if (to) {
      // Redirecionamento imediato via replace para não poluir o histórico
      window.location.replace(to);
    }
  }, [to]);

  // Renderização mínima enquanto o browser executa o redirect
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f172a",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid #2D8CC7",
          borderTopColor: "transparent",
          animation: "spin 0.6s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
