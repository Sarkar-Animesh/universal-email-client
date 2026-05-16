import { beforeEach, describe, expect, it } from "vitest";
import { EmailDB } from "@/lib/db/schema";
import type { UnifiedThread } from "@/lib/types";

let db: EmailDB;

beforeEach(async () => {
  if (db) db.close();
  // fake-indexeddb is reset between tests by the setup; but for safety, use a
  // fresh DB name each test would also work. Here we rely on the polyfill.
  db = new EmailDB();
  await db.open();
  await db.threads.clear();
});

const thread = (over: Partial<UnifiedThread> = {}): UnifiedThread => ({
  id: "t1",
  account_id: "acc1",
  subject: "Hello",
  participants: [{ address: "a@x.com", name: "A" }],
  message_count: 1,
  last_message_date: new Date().toISOString(),
  labels: ["inbox"],
  flags: { has_unread: true, has_starred: false, has_attachments: false },
  snippet: "hi",
  ...over,
});

describe("EmailDB", () => {
  it("persists and retrieves a thread", async () => {
    await db.threads.put(thread());
    const got = await db.threads.get("t1");
    expect(got?.subject).toBe("Hello");
  });

  it("indexes labels with multi-entry", async () => {
    await db.threads.bulkPut([
      thread({ id: "t1", labels: ["inbox"] }),
      thread({ id: "t2", labels: ["inbox", "starred"] }),
      thread({ id: "t3", labels: ["promotions"] }),
    ]);
    const starred = await db.threads.where("labels").equals("starred").toArray();
    expect(starred.map((t) => t.id)).toEqual(["t2"]);
    const inbox = await db.threads.where("labels").equals("inbox").toArray();
    expect(inbox.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });
});
