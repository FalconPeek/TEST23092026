import { describe, expect, it } from "vitest";
import type { NotificationInsert, NotificationsRepo, PushSubscriptionRow } from "./notifications-repo";
import type { PushSendResult } from "./push";
import { notify } from "./notifications";

const PAYLOAD = { title: "t", body: "b", url: "/x" };

class FakeNotificationsRepo implements NotificationsRepo {
  prefs = new Map<string, Record<string, boolean>>();
  subscriptions = new Map<string, PushSubscriptionRow[]>();
  pushResults = new Map<string, PushSendResult>(); // keyed by subscription id
  pushThrows = new Set<string>();

  inserted: NotificationInsert[] = [];
  sentPushes: { subscriptionId: string; payload: unknown }[] = [];
  touched: string[] = [];
  deleted: string[] = [];

  async loadNotificationPrefs(userIds: string[]) {
    const result = new Map<string, Record<string, boolean>>();
    for (const id of userIds) if (this.prefs.has(id)) result.set(id, this.prefs.get(id)!);
    return result;
  }
  async insertNotifications(rows: NotificationInsert[]) {
    this.inserted.push(...rows);
  }
  async loadPushSubscriptions(userIds: string[]) {
    const result = new Map<string, PushSubscriptionRow[]>();
    for (const id of userIds) result.set(id, this.subscriptions.get(id) ?? []);
    return result;
  }
  async sendPush(subscription: PushSubscriptionRow) {
    if (this.pushThrows.has(subscription.id)) throw new Error("transport exploded");
    this.sentPushes.push({ subscriptionId: subscription.id, payload: PAYLOAD });
    return this.pushResults.get(subscription.id) ?? { ok: true, expired: false };
  }
  async touchPushSubscription(id: string) {
    this.touched.push(id);
  }
  async deletePushSubscription(id: string) {
    this.deleted.push(id);
  }
}

function sub(id: string): PushSubscriptionRow {
  return { id, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a" };
}

describe("notify", () => {
  it("does nothing for an empty user list", async () => {
    const repo = new FakeNotificationsRepo();
    await notify(repo, { userIds: [], groupId: null, kind: "match_finalized", payload: PAYLOAD });
    expect(repo.inserted).toEqual([]);
  });

  it("deduplicates userIds", async () => {
    const repo = new FakeNotificationsRepo();
    await notify(repo, { userIds: ["u1", "u1"], groupId: "g1", kind: "match_finalized", payload: PAYLOAD });
    expect(repo.inserted).toHaveLength(1);
  });

  it("inserts a notification row per opted-in user", async () => {
    const repo = new FakeNotificationsRepo();
    await notify(repo, { userIds: ["u1", "u2"], groupId: "g1", kind: "match_finalized", payload: PAYLOAD });
    expect(repo.inserted).toEqual([
      { userId: "u1", groupId: "g1", kind: "match_finalized", payload: PAYLOAD },
      { userId: "u2", groupId: "g1", kind: "match_finalized", payload: PAYLOAD },
    ]);
  });

  it("skips a user who explicitly disabled this kind", async () => {
    const repo = new FakeNotificationsRepo();
    repo.prefs.set("u1", { match_finalized: false });
    await notify(repo, { userIds: ["u1", "u2"], groupId: "g1", kind: "match_finalized", payload: PAYLOAD });
    expect(repo.inserted).toEqual([{ userId: "u2", groupId: "g1", kind: "match_finalized", payload: PAYLOAD }]);
  });

  it("treats an absent prefs key as enabled (missing profiles row too)", async () => {
    const repo = new FakeNotificationsRepo();
    repo.prefs.set("u1", { some_other_kind: false }); // no explicit match_finalized entry
    await notify(repo, { userIds: ["u1"], groupId: "g1", kind: "match_finalized", payload: PAYLOAD });
    expect(repo.inserted).toHaveLength(1);
  });

  it("sends a push per subscription and touches last_used_at on success", async () => {
    const repo = new FakeNotificationsRepo();
    repo.subscriptions.set("u1", [sub("s1"), sub("s2")]);
    await notify(repo, { userIds: ["u1"], groupId: null, kind: "badge_awarded", payload: PAYLOAD });
    expect(repo.sentPushes.map((p) => p.subscriptionId).sort()).toEqual(["s1", "s2"]);
    expect(repo.touched.sort()).toEqual(["s1", "s2"]);
    expect(repo.deleted).toEqual([]);
  });

  it("deletes an expired subscription instead of touching it", async () => {
    const repo = new FakeNotificationsRepo();
    repo.subscriptions.set("u1", [sub("s1")]);
    repo.pushResults.set("s1", { ok: false, expired: true, error: "410" });
    await notify(repo, { userIds: ["u1"], groupId: null, kind: "badge_awarded", payload: PAYLOAD });
    expect(repo.deleted).toEqual(["s1"]);
    expect(repo.touched).toEqual([]);
  });

  it("leaves a non-expired failed subscription alone (transient error)", async () => {
    const repo = new FakeNotificationsRepo();
    repo.subscriptions.set("u1", [sub("s1")]);
    repo.pushResults.set("s1", { ok: false, expired: false, error: "500" });
    await notify(repo, { userIds: ["u1"], groupId: null, kind: "badge_awarded", payload: PAYLOAD });
    expect(repo.deleted).toEqual([]);
    expect(repo.touched).toEqual([]);
  });

  it("a subscriber with no push subscriptions still gets the notifications row (spectator with only in-app)", async () => {
    const repo = new FakeNotificationsRepo();
    await notify(repo, { userIds: ["u1"], groupId: "g1", kind: "match_scheduled", payload: PAYLOAD });
    expect(repo.inserted).toHaveLength(1);
    expect(repo.sentPushes).toEqual([]);
  });

  it("one subscription's transport throwing does not stop the others or the notification insert", async () => {
    const repo = new FakeNotificationsRepo();
    repo.subscriptions.set("u1", [sub("s1"), sub("s2")]);
    repo.pushThrows.add("s1");
    await notify(repo, { userIds: ["u1"], groupId: null, kind: "badge_awarded", payload: PAYLOAD });
    expect(repo.inserted).toHaveLength(1);
    expect(repo.sentPushes.map((p) => p.subscriptionId)).toEqual(["s2"]);
  });
});
