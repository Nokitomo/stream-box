#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function run() {
  const root = process.cwd();
  const srcDir = path.join(root, "data", "app");
  const destDir = path.join(root, "dist", "data", "app");

  try {
    await fs.access(srcDir);
  } catch {
    throw new Error(`Directory not found: ${srcDir}`);
  }

  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destDir), { recursive: true });
  await fs.cp(srcDir, destDir, { recursive: true, force: true });
  console.log(`[copy-static-data] copied ${srcDir} -> ${destDir}`);
}

run().catch((error) => {
  console.error("[copy-static-data] failed", error);
  process.exitCode = 1;
});
