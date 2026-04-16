import { createStore } from "./state/store.js";
import { initRenderer } from "./ui/render.js";
import { initInteractions } from "./ui/interactions.js";

const store = createStore();
const renderer = initRenderer(store);

store.subscribe(() => {
  renderer.render();
});

initInteractions(store, renderer);
renderer.render();
