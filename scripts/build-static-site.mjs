#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const distDir = path.join(root, "dist");

async function copyPath(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(distDir, relativePath);
  await fs.cp(source, target, { recursive: true, force: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isAccessError(error) {
  const code = String(error && error.code || "").toUpperCase();
  return code === "EPERM" || code === "EACCES";
}

async function runCatalogBuildInto(targetDir) {
  const scriptPath = path.join(root, "scripts", "scrapers", "build-app-catalog.mjs");
  await fs.mkdir(targetDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, "--out-dir", targetDir],
      { stdio: "inherit", cwd: root }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`catalog build failed with exit code ${code}`));
    });
  });
}

async function run() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  await copyPath("index.html");
  await copyPath("html");
  await copyPath("assets");
  await copyPath("css");
  await copyPath("js");

  const appDataSource = path.join(root, "data", "app");
  if (await pathExists(appDataSource)) {
    try {
      await copyPath("data/app");
    } catch (error) {
      if (!isAccessError(error)) throw error;
      const outDir = path.join(distDir, "data", "app");
      console.warn("[build-static] data/app non leggibile, rigenero catalogo in dist/data/app");
      await runCatalogBuildInto(outDir);
    }
  } else {
    const fallbackDir = path.join(distDir, "data", "app");
    await fs.mkdir(fallbackDir, { recursive: true });
    await fs.writeFile(
      path.join(fallbackDir, "catalog-index.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          totalItems: 0,
          featuredId: "",
          maxItemsPerRow: 120,
          rowConfigs: [],
          providers: [],
          detailChunks: [],
          items: []
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }

  const mockDataSource = path.join(root, "data", "mocks");
  if (await pathExists(mockDataSource)) {
    await copyPath("data/mocks");
  }

  console.log("[build-static] dist ready");
}

run().catch((error) => {
  console.error("[build-static] fatal", error);
  process.exitCode = 1;
});
