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

const titleHtml = readFileSync(join(root, "title.html"), "utf8");
assert(titleHtml.includes("id=\"titleSimilar\""), "Pagina titolo senza sezione titoli simili");

const playerHtml = readFileSync(join(root, "player.html"), "utf8");
assert(playerHtml.includes("id=\"playerProgressFill\""), "Player senza barra avanzamento");

console.log("test-static: ok");
