import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
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
                    if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/@preact/signals-react")) {
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
});
