// Copies the pdf.js worker into /public so the browser can load it from the same origin.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pdf.worker.min.mjs");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.js worker to public/pdf.worker.min.mjs");
