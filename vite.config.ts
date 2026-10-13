import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas que mudam pouco ficam em arquivos próprios: o navegador as mantém em cache
        // entre publicações. As telas (e o que só elas usam, como exceljs) são divididas por rota.
        manualChunks(id) {
          // Helper de interop CommonJS: usado por todos; se ficasse em "charts", a entrada puxaria os gráficos.
          if (id.includes("commonjsHelpers")) return "react-vendor";
          if (!id.includes("node_modules")) return undefined;
          // clsx também é usado pelo recharts: sem isto o Rollup o deixaria dentro de "charts".
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|clsx|tailwind-merge|class-variance-authority)\//.test(id)) return "react-vendor";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) return "charts";
          return undefined;
        },
      },
    },
  },
}));
