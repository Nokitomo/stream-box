const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const requiredFiles = [
  "index.html",
  "title.html",
  "player.html",
  "assets/poster-fallback.svg",
  "assets/backdrop-fallback.svg",
  "js/main.js",
  "js/pages/title-page.js",
  "js/pages/player-page.js"
];

requiredFiles.forEach((file) => {
  assert(existsSync(join(root, file)), `File mancante: ${file}`);
});

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
assert(indexHtml.includes("data-modal-action=\"open-page\""), "Manca il pulsante scheda completa nel modal");
assert(indexHtml.includes("js/state/url-state.js"), "Manca script URL state");
assert(indexHtml.includes("js/main.js"), "Manca bootstrap principale");
assert(indexHtml.includes("js/data/catalog-loader.js"), "Manca loader catalogo JSON nell'index");

const titleHtml = readFileSync(join(root, "title.html"), "utf8");
assert(titleHtml.includes("id=\"titleSimilar\""), "Pagina titolo senza sezione titoli simili");
assert(titleHtml.includes("id=\"titleFacts\""), "Pagina titolo senza sezione dettagli metadata");
assert(titleHtml.includes("js/data/catalog-loader.js"), "Manca loader catalogo JSON nella pagina titolo");

const playerHtml = readFileSync(join(root, "player.html"), "utf8");
assert(playerHtml.includes("id=\"playerProgressFill\""), "Player senza barra avanzamento");
assert(playerHtml.includes("id=\"playerProvider\""), "Player senza metadata provider");
assert(playerHtml.includes("js/data/catalog-loader.js"), "Manca loader catalogo JSON nella pagina player");

console.log("test-static: ok");
