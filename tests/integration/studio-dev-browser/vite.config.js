import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const harnessDirectory = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(harnessDirectory, "../../..");

export default defineConfig({
  root: projectRoot,
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
  build: {
    outDir: resolve(harnessDirectory, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(harnessDirectory, "index.html"),
    },
  },
});
