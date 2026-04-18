#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

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

async function run() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  await copyPath("index.html");
  await copyPath("title.html");
  await copyPath("player.html");
  await copyPath("assets");
  await copyPath("css");
  await copyPath("js");

  const appDataSource = path.join(root, "data", "app");
  if (await pathExists(appDataSource)) {
    await copyPath("data/app");
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
          items: [],
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }

  console.log("[build-static] dist ready");
}

run().catch((error) => {
  console.error("[build-static] fatal", error);
  process.exitCode = 1;
});
