import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const adminClient = { rpc: rpcMock };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminClient) }));
vi.mock("@/lib/server/finalize-repo", () => ({ createSupabaseFinalizeRepo: vi.fn(() => ({})) }));
vi.mock("@/lib/server/rating-repo", () => ({ createSupabaseRatingRepo: vi.fn(() => ({})) }));

const processPendingFinalizeMock = vi.fn();
vi.mock("@/lib/server/finalize", () => ({ processPendingFinalize: (...args: unknown[]) => processPendingFinalizeMock(...args) }));

const drainRecomputeQueueMock = vi.fn();
vi.mock("@/lib/server/recompute", () => ({ drainRecomputeQueue: (...args: unknown[]) => drainRecomputeQueueMock(...args) }));

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("app/api/cron/finalize route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    rpcMock.mockReset().mockResolvedValue({ data: 2, error: null });
    processPendingFinalizeMock.mockReset().mockResolvedValue({
      matchIds: ["m1"],
      outcomes: [{ matchId: "m1", status: "finalized" }],
      finalized: 1,
      disputed: 0,
      errors: [],
    });
    drainRecomputeQueueMock.mockReset().mockResolvedValue({
      groupsProcessed: 1,
      playersProcessed: 2,
      playersSucceeded: 2,
      playersFailed: 0,
      failures: [],
    });
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("rejects a request with no Authorization header", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/finalize"));
    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/finalize", { method: "POST", headers: { authorization: "Bearer wrong" } }),
    );
    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/finalize", { headers: { authorization: "Bearer test-secret" } }),
    );
    expect(response.status).toBe(401);
  });

  it("runs the pipeline and returns counts for a correctly authorized request", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/cron/finalize", { method: "POST", headers: { authorization: "Bearer test-secret" } }),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("close_expired_windows");
    expect(processPendingFinalizeMock).toHaveBeenCalled();
    expect(drainRecomputeQueueMock).toHaveBeenCalled();

    const body = await response.json();
    expect(body).toMatchObject({
      closedWindows: 2,
      matchesProcessed: 1,
      matchesFinalized: 1,
      matchesDisputed: 0,
      playersRecomputed: 2,
    });
  });

  it("returns 500 without running the finalizer when close_expired_windows errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db exploded" } });
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/finalize", { headers: { authorization: "Bearer test-secret" } }),
    );

    expect(response.status).toBe(500);
    expect(processPendingFinalizeMock).not.toHaveBeenCalled();
  });

  it("accepts GET too (for schedulers that only issue GET)", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/finalize", { headers: { authorization: "Bearer test-secret" } }),
    );
    expect(response.status).toBe(200);
  });
});
