import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";

let dir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deckplanner-"));
  app = createApp(join(dir, "decks.json"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("decks", () => {
  it("starts empty", async () => {
    const res = await request(app).get("/api/decks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates and fetches a deck", async () => {
    const create = await request(app)
      .post("/api/decks")
      .send({ title: "Launch Plan", description: "Q3 launch" });
    expect(create.status).toBe(201);
    expect(create.body.title).toBe("Launch Plan");
    expect(create.body.slides).toEqual([]);

    const get = await request(app).get(`/api/decks/${create.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.description).toBe("Q3 launch");
  });

  it("rejects a deck without a title", async () => {
    const res = await request(app).post("/api/decks").send({ description: "no title" });
    expect(res.status).toBe(400);
  });

  it("adds, reorders and deletes slides", async () => {
    const deck = (await request(app).post("/api/decks").send({ title: "Talk" })).body;

    const s1 = (await request(app).post(`/api/decks/${deck.id}/slides`).send({ title: "Intro" })).body;
    const s2 = (await request(app).post(`/api/decks/${deck.id}/slides`).send({ title: "Body" })).body;
    const s3 = (await request(app).post(`/api/decks/${deck.id}/slides`).send({ title: "Outro" })).body;

    const reordered = await request(app)
      .put(`/api/decks/${deck.id}/slides/order`)
      .send({ order: [s3.id, s1.id, s2.id] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.slides.map((s: { title: string }) => s.title)).toEqual([
      "Outro",
      "Intro",
      "Body",
    ]);

    const del = await request(app).delete(`/api/decks/${deck.id}/slides/${s1.id}`);
    expect(del.status).toBe(204);

    const after = (await request(app).get(`/api/decks/${deck.id}`)).body;
    expect(after.slides).toHaveLength(2);
  });

  it("persists across store instances", async () => {
    const file = join(dir, "persist.json");
    const app1 = createApp(file);
    const created = (await request(app1).post("/api/decks").send({ title: "Persisted" })).body;

    const app2 = createApp(file);
    const res = await request(app2).get(`/api/decks/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Persisted");
  });
});
