import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "invest_assistant/ui/android/h5/dist");
const destination = resolve(root, "invest_assistant/ui/web/public/mobile");
const allowedDestinationRoot = resolve(root, "invest_assistant/ui/web/public");

if (!destination.startsWith(`${allowedDestinationRoot}\\`) && !destination.startsWith(`${allowedDestinationRoot}/`)) {
  throw new Error(`Refusing to sync outside Web public directory: ${destination}`);
}
if (!existsSync(resolve(source, "index.html"))) {
  throw new Error("Mobile H5 has not been built. Run npm run build in invest_assistant/ui/android/h5 first.");
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`Mobile H5 synced to ${destination}`);
