import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? "../data/decks.json";

const app = createApp(DATA_FILE);

app.listen(PORT, () => {
  console.log(`[deckplanner-server] listening on http://localhost:${PORT}`);
  console.log(`[deckplanner-server] data file: ${DATA_FILE}`);
});
