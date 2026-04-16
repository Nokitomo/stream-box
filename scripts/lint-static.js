const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, extname } = require("node:path");
const { spawnSync } = require("node:child_process");

function collectFiles(dir, extension, bucket = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, extension, bucket);
      continue;
    }

    if (extname(fullPath) === extension) {
      bucket.push(fullPath);
    }
  }

  return bucket;
}

function checkLines(file, maxLines) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).length;
  if (lines > maxLines) {
    throw new Error(`${file} supera ${maxLines} righe (${lines})`);
  }
}

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`Errore sintassi in ${file}\n${result.stderr || result.stdout}`);
  }
}

const jsFiles = collectFiles(join(process.cwd(), "js"), ".js");
const cssFiles = collectFiles(join(process.cwd(), "css"), ".css");

jsFiles.forEach((file) => {
  runNodeCheck(file);
  checkLines(file, 400);
});

cssFiles.forEach((file) => {
  checkLines(file, 400);
});

checkLines(join(process.cwd(), "index.html"), 400);
checkLines(join(process.cwd(), "title.html"), 400);
checkLines(join(process.cwd(), "player.html"), 400);

console.log("lint-static: ok");
