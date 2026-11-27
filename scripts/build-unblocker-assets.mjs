import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const publicDir = path.join(rootDir, "public");

function packageDist(packageName) {
  const entry = require.resolve(packageName);
  return path.dirname(entry);
}

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
  if (missing.length) {
    throw new Error(label + " is missing required files: " + missing.join(", "));
  }
}

const uvTarget = path.join(publicDir, "uv");
const baremuxTarget = path.join(publicDir, "baremux");
const libcurlTarget = path.join(publicDir, "libcurl");
const epoxyTarget = path.join(publicDir, "epoxy");

copyPackage(uvPath, uvTarget, "Ultraviolet");
copyPackage(baremuxPath, baremuxTarget, "BareMux");
copyPackage(packageDist("@mercuryworkshop/libcurl-transport"), libcurlTarget, "Libcurl transport");
copyPackage(packageDist("@mercuryworkshop/epoxy-transport"), epoxyTarget, "Epoxy transport");

requireFiles(uvTarget, ["uv.bundle.js", "uv.handler.js", "uv.sw.js"], "Ultraviolet");
requireFiles(baremuxTarget, ["index.js", "worker.js"], "BareMux");
requireFiles(libcurlTarget, ["index.mjs"], "Libcurl transport");
requireFiles(epoxyTarget, ["index.mjs"], "Epoxy transport");

const manifest = {
  generatedAt: new Date().toISOString(),
  packages: {
    "@titaniumnetwork-dev/ultraviolet": "3.2.10",
    "@mercuryworkshop/bare-mux": "2.1.9",
    "@mercuryworkshop/libcurl-transport": "1.5.2",
    "@mercuryworkshop/epoxy-transport": "2.1.28"
  },
  paths: ["/public/uv/", "/public/baremux/", "/public/libcurl/", "/public/epoxy/"]
};

writeFileSync(
  path.join(publicDir, "unblocker-assets.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);

console.log("Unblocker assets built and checked.");
