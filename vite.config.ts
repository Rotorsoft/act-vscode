import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/webview",
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "../../dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        assetFileNames: "main.[ext]",
      },
    },
  },
});
