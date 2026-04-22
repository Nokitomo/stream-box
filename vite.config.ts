import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11", "chrome >= 58", "safari >= 11", "edge >= 16"],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    target: "es2019",
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
