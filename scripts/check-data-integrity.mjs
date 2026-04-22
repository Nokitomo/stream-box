#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function assertFile(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    fail(`${label} missing: ${filePath}`);
  }
}

async function checkProviderIndex(root, provider) {
  const indexPath = path.join(root, "data", "providers", provider, "index.json");
  await assertFile(indexPath, `${provider} index`);
  const index = await readJson(indexPath);
  if (!Array.isArray(index?.chunks) || index.chunks.length === 0) {
    fail(`${provider}: chunks missing`);
  }
  let total = 0;
  for (const chunk of index.chunks) {
    const chunkPath = path.join(root, "data", "providers", provider, String(chunk.file || ""));
    await assertFile(chunkPath, `${provider} chunk`);
    const chunkData = await readJson(chunkPath);
    if (!Array.isArray(chunkData?.items)) {
      fail(`${provider}: invalid chunk items ${chunkPath}`);
    }
    total += chunkData.items.length;
  }
  if (Number(index.count || 0) !== total) {
    fail(`${provider}: count mismatch (index=${index.count}, actual=${total})`);
  }
  return total;
}

async function checkAppData(root) {
  const appDir = path.join(root, "data", "app");
  const manifestPath = path.join(appDir, "manifest.json");
  const catalogIndexPath = path.join(appDir, "catalog-index.json");
  const searchPath = path.join(appDir, "search-index.json");
  const episodesIndexPath = path.join(appDir, "episodes-index.json");

  await assertFile(manifestPath, "manifest");
  await assertFile(catalogIndexPath, "catalog index");
  await assertFile(searchPath, "search index");
  await assertFile(episodesIndexPath, "episodes index");

  const manifest = await readJson(manifestPath);
  const catalogIndex = await readJson(catalogIndexPath);
  const searchIndex = await readJson(searchPath);
  const episodesIndex = await readJson(episodesIndexPath);

  if (!Array.isArray(catalogIndex?.items) || catalogIndex.items.length === 0) {
    fail("catalog index has no items");
  }
  if (!Array.isArray(searchIndex) || searchIndex.length === 0) {
    fail("search index has no entries");
  }
  if (!Array.isArray(episodesIndex?.chunks) || episodesIndex.chunks.length === 0) {
    fail("episodes index has no chunks");
  }
  if (!manifest?.datasets?.catalogIndex || !manifest?.datasets?.searchIndex || !manifest?.datasets?.episodesIndex) {
    fail("manifest datasets missing");
  }

  let episodesTotal = 0;
  for (const chunk of episodesIndex.chunks) {
    const chunkPath = path.join(appDir, String(chunk.file || ""));
    await assertFile(chunkPath, "episodes chunk");
    const chunkData = await readJson(chunkPath);
    if (!Array.isArray(chunkData?.items)) fail(`episodes chunk invalid items: ${chunkPath}`);
    episodesTotal += chunkData.items.length;
  }
  if (Number(episodesIndex.count || 0) !== episodesTotal) {
    fail(`episodes count mismatch (index=${episodesIndex.count}, actual=${episodesTotal})`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        generatedAt: manifest.generatedAt,
        version: manifest.version,
        counts: {
          catalogItems: catalogIndex.items.length,
          searchEntries: searchIndex.length,
          episodeSeasons: episodesTotal,
        },
      },
      null,
      2
    )
  );
}

async function run() {
  const root = process.cwd();
  const animeCount = await checkProviderIndex(root, "animeunity");
  const streamCount = await checkProviderIndex(root, "streamingunity");
  console.log(`[integrity] providers ok animeunity=${animeCount} streamingunity=${streamCount}`);
  await checkAppData(root);
}

run().catch((error) => {
  console.error("[integrity] failed", error);
  process.exitCode = 1;
});
