#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const root = process.cwd();
  const indexPath = path.join(root, "data", "app", "catalog-index.json");
  const index = await readJson(indexPath);
  assert(Array.isArray(index?.items) && index.items.length > 0, "catalog-index has no items");

  const providers = new Set(index.items.map((item) => item.provider));
  assert(providers.has("animeunity"), "animeunity not present in catalog");
  assert(providers.has("streamingunity"), "streamingunity not present in catalog");

  const movie = index.items.find((item) => item.type === "movie");
  const series = index.items.find((item) => item.type === "series");
  assert(Boolean(movie), "no movie sample in catalog");
  assert(Boolean(series), "no series sample in catalog");

  const episodesIndex = await readJson(path.join(root, "data", "app", "episodes-index.json"));
  assert(Array.isArray(episodesIndex?.chunks) && episodesIndex.chunks.length > 0, "episodes index missing chunks");

  const firstChunk = await readJson(path.join(root, "data", "app", episodesIndex.chunks[0].file));
  assert(Array.isArray(firstChunk?.items), "first episodes chunk has invalid items");

  console.log(
    JSON.stringify(
      {
        ok: true,
        movieSample: movie?.id || null,
        seriesSample: series?.id || null,
        episodesChunkItems: firstChunk.items.length,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("[smoke-runtime] failed", error);
  process.exitCode = 1;
});
