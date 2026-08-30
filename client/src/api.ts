import type { Deck, Slide } from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listDecks: () => req<Deck[]>("/api/decks"),
  getDeck: (id: string) => req<Deck>(`/api/decks/${id}`),
  createDeck: (title: string, description: string) =>
    req<Deck>("/api/decks", {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  deleteDeck: (id: string) => req<void>(`/api/decks/${id}`, { method: "DELETE" }),
  addSlide: (deckId: string, title: string, notes: string) =>
    req<Slide>(`/api/decks/${deckId}/slides`, {
      method: "POST",
      body: JSON.stringify({ title, notes }),
    }),
  updateSlide: (deckId: string, slideId: string, patch: Partial<Pick<Slide, "title" | "notes">>) =>
    req<Slide>(`/api/decks/${deckId}/slides/${slideId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteSlide: (deckId: string, slideId: string) =>
    req<void>(`/api/decks/${deckId}/slides/${slideId}`, { method: "DELETE" }),
  reorderSlides: (deckId: string, order: string[]) =>
    req<Deck>(`/api/decks/${deckId}/slides/order`, {
      method: "PUT",
      body: JSON.stringify({ order }),
    }),
};
