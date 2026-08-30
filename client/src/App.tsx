import { useEffect, useMemo, useState } from "react";
import type { Deck } from "./types";
import { api } from "./api";

export default function App() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [slideTitle, setSlideTitle] = useState("");
  const [slideNotes, setSlideNotes] = useState("");

  const selected = useMemo(
    () => decks.find((d) => d.id === selectedId) ?? null,
    [decks, selectedId],
  );

  async function refresh(selectAfter?: string) {
    try {
      const list = await api.listDecks();
      setDecks(list);
      if (selectAfter) setSelectedId(selectAfter);
      else if (list.length && !list.some((d) => d.id === selectedId)) {
        setSelectedId(list[0].id);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const deck = await api.createDeck(newTitle.trim(), newDescription.trim());
      setNewTitle("");
      setNewDescription("");
      await refresh(deck.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteDeck(id: string) {
    try {
      await api.deleteDeck(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !slideTitle.trim()) return;
    try {
      await api.addSlide(selected.id, slideTitle.trim(), slideNotes.trim());
      setSlideTitle("");
      setSlideNotes("");
      await refresh(selected.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteSlide(slideId: string) {
    if (!selected) return;
    try {
      await api.deleteSlide(selected.id, slideId);
      await refresh(selected.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!selected) return;
    const order = selected.slides.map((s) => s.id);
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await api.reorderSlides(selected.id, order);
      await refresh(selected.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const totalSlides = decks.reduce((sum, d) => sum + d.slides.length, 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▚</span>
          <div>
            <h1>DeckPlanner</h1>
            <p className="tagline">Plan and organize your presentation decks</p>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{decks.length}</span>
            <span className="stat-label">decks</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalSlides}</span>
            <span className="stat-label">slides</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button className="banner-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          <form className="card create-form" onSubmit={handleCreateDeck}>
            <h2>New deck</h2>
            <input
              className="input"
              placeholder="Deck title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <input
              className="input"
              placeholder="Short description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={!newTitle.trim()}>
              Create deck
            </button>
          </form>

          <div className="deck-list">
            {loading && <p className="muted">Loading…</p>}
            {!loading && decks.length === 0 && (
              <p className="muted">No decks yet. Create your first one above.</p>
            )}
            {decks.map((deck) => (
              <button
                key={deck.id}
                className={`deck-item ${deck.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(deck.id)}
              >
                <span className="deck-item-title">{deck.title}</span>
                <span className="deck-item-count">{deck.slides.length}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="content">
          {!selected && !loading && (
            <div className="empty-state">
              <h2>Select or create a deck</h2>
              <p className="muted">Your slides will appear here.</p>
            </div>
          )}

          {selected && (
            <div className="deck-detail">
              <div className="deck-header">
                <div>
                  <h2>{selected.title}</h2>
                  {selected.description && <p className="muted">{selected.description}</p>}
                </div>
                <button
                  className="btn danger ghost"
                  onClick={() => handleDeleteDeck(selected.id)}
                >
                  Delete deck
                </button>
              </div>

              <form className="card add-slide" onSubmit={handleAddSlide}>
                <h3>Add a slide</h3>
                <input
                  className="input"
                  placeholder="Slide title"
                  value={slideTitle}
                  onChange={(e) => setSlideTitle(e.target.value)}
                />
                <textarea
                  className="input textarea"
                  placeholder="Speaker notes / talking points (optional)"
                  value={slideNotes}
                  onChange={(e) => setSlideNotes(e.target.value)}
                />
                <button className="btn primary" type="submit" disabled={!slideTitle.trim()}>
                  Add slide
                </button>
              </form>

              <ol className="slides">
                {selected.slides.length === 0 && (
                  <p className="muted">No slides yet — add the first one above.</p>
                )}
                {selected.slides.map((slide, i) => (
                  <li key={slide.id} className="slide-card">
                    <div className="slide-index">{i + 1}</div>
                    <div className="slide-body">
                      <h4>{slide.title}</h4>
                      {slide.notes && <p className="slide-notes">{slide.notes}</p>}
                    </div>
                    <div className="slide-actions">
                      <button
                        className="icon-btn"
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-btn"
                        title="Move down"
                        disabled={i === selected.slides.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Delete slide"
                        onClick={() => handleDeleteSlide(slide.id)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
