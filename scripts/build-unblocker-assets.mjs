import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const publicDir = path.join(rootDir, "public");

function copyPackage(sourceDir, targetDir, label) {
  if (!sourceDir || !existsSync(sourceDir)) {
    throw new Error(label + " package files were not found at " + sourceDir);
  }
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
  console.log("Copied " + label + " → " + path.relative(rootDir, targetDir));
}

function requireFiles(directory, files, label) {
  const missing = files.filter(file => !existsSync(path.join(directory, file)));
  if (missing.length) throw new Error(label + " is missing required files: " + missing.join(", "));
}

const scramjetTarget = path.join(publicDir, "scram");
const baremuxTarget = path.join(publicDir, "baremux");
const libcurlTarget = path.join(publicDir, "libcurl");
const epoxyTarget = path.join(publicDir, "epoxy");

// Remove stale Ultraviolet output so it cannot be accidentally redeployed.
rmSync(path.join(publicDir, "uv"), { recursive: true, force: true });

copyPackage(scramjetPath, scramjetTarget, "Scramjet");
copyPackage(baremuxPath, baremuxTarget, "BareMux");
copyPackage(libcurlPath, libcurlTarget, "Libcurl transport");
copyPackage(epoxyPath, epoxyTarget, "Epoxy transport");

requireFiles(scramjetTarget, ["scramjet.all.js", "scramjet.wasm.wasm", "scramjet.sync.js"], "Scramjet");
requireFiles(baremuxTarget, ["index.js", "worker.js"], "BareMux");
requireFiles(libcurlTarget, ["index.mjs"], "Libcurl transport");
requireFiles(epoxyTarget, ["index.mjs"], "Epoxy transport");

const manifest = {
  generatedAt: new Date().toISOString(),
  packages: {
    "@mercuryworkshop/scramjet": "1.1.0",
    "@mercuryworkshop/bare-mux": "2.1.9",
    "@mercuryworkshop/libcurl-transport": "1.5.2",
    "@mercuryworkshop/epoxy-transport": "2.1.28"
  },
  paths: ["/public/scram/", "/public/baremux/", "/public/libcurl/", "/public/epoxy/"]
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, "unblocker-assets.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Scramjet assets built and checked.");
