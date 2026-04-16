import { movieCatalog } from "./movies.js";
import { seriesCatalog } from "./series.js";

export const featuredId = "stranger-things";

export const rowConfigs = [
  { id: "continue", title: "Continua a guardare" },
  { id: "trending", title: "Di tendenza adesso" },
  { id: "top10", title: "Top 10 in Italia oggi", top10: true },
  { id: "netflix-only", title: "Solo su Netflix" },
  { id: "action", title: "Azione ad alta tensione" },
  { id: "crime", title: "Crime e thriller" },
  { id: "comedy", title: "Commedie da non perdere" },
  { id: "sci-fi", title: "Sci-fi e fantasy" },
  { id: "new-release", title: "Nuove uscite" }
];

export const mediaCatalog = [...seriesCatalog, ...movieCatalog];
