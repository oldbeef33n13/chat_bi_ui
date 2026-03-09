import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createLocalExampleApiPlugin } from "./localexample/local-api-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const localApiEnabled = env.VITE_LOCAL_API !== "false";

  return {
    plugins: [react(), createLocalExampleApiPlugin({ enabled: localApiEnabled })],
    server: {
      port: 5173
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/echarts")) {
              return "echarts-vendor";
            }
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom") ||
              id.includes("node_modules/@preact/signals-react")
            ) {
              return "react-vendor";
            }
            if (id.includes("node_modules/ajv") || id.includes("node_modules/ajv-formats")) {
              return "schema-vendor";
            }
            return undefined;
          }
        }
      }
    }
  };
});
