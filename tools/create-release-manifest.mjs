import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
const assetVersion = process.argv[3];
if (!version || !assetVersion) throw new Error("Usage: node tools/create-release-manifest.mjs <release-version> <asset-version>");

const definitions = [
  ["./", "index.html"],
  ["./index.html", "index.html"],
  ["./manifest.webmanifest", "manifest.webmanifest"],
  [`./styles.css?v=${assetVersion}`, "styles.css"],
  ...["core", "storage", "workouts", "manager", "timer", "pwa", "app"].map(name => [`./js/${name}.js?v=${assetVersion}`, `js/${name}.js`]),
  ["./icons/icon-192.png", "icons/icon-192.png"],
  ["./icons/icon-512.png", "icons/icon-512.png"],
  ["./icons/icon-maskable-512.png", "icons/icon-maskable-512.png"],
];

const assets = await Promise.all(definitions.map(async ([url, file]) => ({
  url,
  sha256: createHash("sha256").update(await readFile(file)).digest("hex"),
})));

await writeFile("release.json", `${JSON.stringify({ version, assets }, null, 2)}\n`);
