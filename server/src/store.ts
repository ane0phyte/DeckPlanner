import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Database, Deck } from "./types.js";

/**
 * Tiny file-backed JSON store. Chosen over a real database so the environment
 * has zero external service dependencies while still exercising real
 * persistence across process restarts.
 */
export class Store {
  private readonly file: string;
  private data: Database;

  constructor(file: string) {
    this.file = resolve(file);
    this.data = this.load();
  }

  private load(): Database {
    if (!existsSync(this.file)) {
      return { decks: [] };
    }
    try {
      const raw = readFileSync(this.file, "utf-8");
      const parsed = JSON.parse(raw) as Partial<Database>;
      return { decks: Array.isArray(parsed.decks) ? parsed.decks : [] };
    } catch {
      return { decks: [] };
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  listDecks(): Deck[] {
    return this.data.decks;
  }

  getDeck(id: string): Deck | undefined {
    return this.data.decks.find((d) => d.id === id);
  }

  addDeck(deck: Deck): Deck {
    this.data.decks.unshift(deck);
    this.persist();
    return deck;
  }

  replaceDeck(deck: Deck): void {
    const idx = this.data.decks.findIndex((d) => d.id === deck.id);
    if (idx >= 0) {
      this.data.decks[idx] = deck;
      this.persist();
    }
  }

  removeDeck(id: string): boolean {
    const before = this.data.decks.length;
    this.data.decks = this.data.decks.filter((d) => d.id !== id);
    const changed = this.data.decks.length !== before;
    if (changed) this.persist();
    return changed;
  }
}
