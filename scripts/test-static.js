const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const requiredFiles = [
  'index.html',
  'html/title.html',
  'html/player.html',
  'assets/poster-fallback.svg',
  'assets/backdrop-fallback.svg',
  'js/main.js',
  'js/pages/title-page.js',
  'js/pages/player-page.js',
  'js/player/player-contract.js',
  'js/player/player-storage.js',
  'js/player/player-episodes.js',
  'js/player/player-tracks.js',
  'js/player/player-adapter.js',
  'js/player/player-engine.js',
  'js/player/player-ui.js',
  'js/player/player-view.js',
  'js/data/catalog-loader.js',
  'js/compat/polyfills.js',
  'data/mocks/player/streams-by-id.json'
];

requiredFiles.forEach((file) => {
  assert(existsSync(join(root, file)), `File mancante: ${file}`);
});

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
assert(indexHtml.includes('id="titleModal"'), 'Manca il modal nella home');
assert(indexHtml.includes('js/state/url-state.js'), 'Manca script URL state');
assert(indexHtml.includes('js/main.js'), 'Manca bootstrap principale');
assert(indexHtml.includes('js/data/catalog-loader.js'), 'Manca loader catalogo JSON nell\'index');

const titleHtml = readFileSync(join(root, 'html/title.html'), 'utf8');
assert(titleHtml.includes('id="titleSimilar"'), 'Pagina titolo senza sezione titoli simili');
assert(titleHtml.includes('id="titleFacts"'), 'Pagina titolo senza sezione dettagli metadata');
assert(titleHtml.includes('../js/data/catalog-loader.js'), 'Manca loader catalogo JSON nella pagina titolo');

const playerHtml = readFileSync(join(root, 'html/player.html'), 'utf8');
assert(playerHtml.includes('id="playerMeta"'), 'Player senza sezione metadata');
assert(playerHtml.includes('../js/data/catalog-loader.js'), 'Manca loader catalogo JSON nella pagina player');
assert(playerHtml.includes('player-page.js'), 'Manca pagina player script');
assert(playerHtml.includes('id="playerPageRoot"'), 'Player senza root pagina');
assert(playerHtml.includes('js/player/player-engine.js'), 'Manca engine player');
assert(playerHtml.includes('js/player/player-ui.js'), 'Manca modulo UI player');

console.log('test-static: ok');
