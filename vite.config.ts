import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Supabase isolado — carregado cedo mas separado do app
          "vendor-supabase": ["@supabase/supabase-js"],
          // Recharts só carrega quando o usuário abre a aba Performance
          "vendor-charts": ["recharts"],
          // Radix UI / shadcn components
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-label",
          ],
          // date-fns é grande — chunk separado
          "vendor-dates": ["date-fns"],
          // DnD kit para o kanban
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          // React Query
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
    // Aumentar limite de aviso para 600KB (chunks individuais serão menores)
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
