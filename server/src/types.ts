export interface Slide {
  id: string;
  title: string;
  notes: string;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  decks: Deck[];
}
