import express, { type Request, type Response } from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { Store } from "./store.js";
import type { Deck, Slide } from "./types.js";

export function createApp(dataFile: string) {
  const store = new Store(dataFile);
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "deckplanner-server" });
  });

  app.get("/api/decks", (_req: Request, res: Response) => {
    res.json(store.listDecks());
  });

  app.post("/api/decks", (req: Request, res: Response) => {
    const title = String(req.body?.title ?? "").trim();
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    const now = new Date().toISOString();
    const deck: Deck = {
      id: nanoid(10),
      title,
      description: String(req.body?.description ?? "").trim(),
      slides: [],
      createdAt: now,
      updatedAt: now,
    };
    store.addDeck(deck);
    res.status(201).json(deck);
  });

  app.get("/api/decks/:id", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    res.json(deck);
  });

  app.patch("/api/decks/:id", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) return res.status(400).json({ error: "title cannot be empty" });
      deck.title = title;
    }
    if (typeof req.body?.description === "string") {
      deck.description = req.body.description.trim();
    }
    deck.updatedAt = new Date().toISOString();
    store.replaceDeck(deck);
    res.json(deck);
  });

  app.delete("/api/decks/:id", (req: Request, res: Response) => {
    const removed = store.removeDeck(req.params.id);
    if (!removed) return res.status(404).json({ error: "deck not found" });
    res.status(204).end();
  });

  app.post("/api/decks/:id/slides", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "slide title is required" });
    const slide: Slide = {
      id: nanoid(10),
      title,
      notes: String(req.body?.notes ?? "").trim(),
    };
    deck.slides.push(slide);
    deck.updatedAt = new Date().toISOString();
    store.replaceDeck(deck);
    res.status(201).json(slide);
  });

  app.patch("/api/decks/:id/slides/:slideId", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    const slide = deck.slides.find((s) => s.id === req.params.slideId);
    if (!slide) return res.status(404).json({ error: "slide not found" });
    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) return res.status(400).json({ error: "slide title cannot be empty" });
      slide.title = title;
    }
    if (typeof req.body?.notes === "string") {
      slide.notes = req.body.notes.trim();
    }
    deck.updatedAt = new Date().toISOString();
    store.replaceDeck(deck);
    res.json(slide);
  });

  app.delete("/api/decks/:id/slides/:slideId", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    const before = deck.slides.length;
    deck.slides = deck.slides.filter((s) => s.id !== req.params.slideId);
    if (deck.slides.length === before) {
      return res.status(404).json({ error: "slide not found" });
    }
    deck.updatedAt = new Date().toISOString();
    store.replaceDeck(deck);
    res.status(204).end();
  });

  // Reorder slides within a deck by providing the full ordered list of slide ids.
  app.put("/api/decks/:id/slides/order", (req: Request, res: Response) => {
    const deck = store.getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "deck not found" });
    const order: string[] = Array.isArray(req.body?.order) ? req.body.order : [];
    const known = new Set(deck.slides.map((s) => s.id));
    const validOrder = order.filter((id) => known.has(id));
    if (validOrder.length !== deck.slides.length) {
      return res.status(400).json({ error: "order must include every slide id exactly once" });
    }
    deck.slides = validOrder.map((id) => deck.slides.find((s) => s.id === id)!);
    deck.updatedAt = new Date().toISOString();
    store.replaceDeck(deck);
    res.json(deck);
  });

  return app;
}
