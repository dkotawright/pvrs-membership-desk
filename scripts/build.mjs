// Copy the static site to dist/. There is no compiler: Firebase Hosting serves public/ directly,
// and dist/ is the same files for Vercel, Cloudflare Pages, or a local preview.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public");
const dest = path.join(root, "dist");
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
const n = fs.readdirSync(dest).length;
console.log(`Built dist/ from public/ (${n} top-level entries). No compile step.`);
