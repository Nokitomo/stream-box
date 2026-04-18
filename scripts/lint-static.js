const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');
const { spawnSync } = require('node:child_process');

function collectFiles(dir, extension, bucket) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  for (let i = 0; i < entries.length; i += 1) {
    const fullPath = join(dir, entries[i]);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, extension, bucket);
      continue;
    }
    if (extname(fullPath) === extension) bucket.push(fullPath);
  }
}

function checkLines(file, maxLines) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).length;
  if (lines > maxLines) throw new Error(`${file} supera ${maxLines} righe (${lines})`);
}

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Errore sintassi in ${file}\n${result.stderr || result.stdout}`);
}

const root = process.cwd();
const jsFiles = [];
const cssFiles = [];
const htmlFiles = [];

collectFiles(join(root, 'js'), '.js', jsFiles);
collectFiles(join(root, 'css'), '.css', cssFiles);
collectFiles(join(root, 'html'), '.html', htmlFiles);
if (existsSync(join(root, 'index.html'))) htmlFiles.push(join(root, 'index.html'));

jsFiles.forEach((file) => {
  runNodeCheck(file);
  checkLines(file, 400);
});

cssFiles.forEach((file) => checkLines(file, 400));
htmlFiles.forEach((file) => checkLines(file, 400));

console.log('lint-static: ok');
