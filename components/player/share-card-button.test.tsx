import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ShareCardButton } from "./share-card-button";
import { es } from "@/messages/es";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mockFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(["fake-png"], { type: "image/png" })),
    }),
  );
}

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

describe("ShareCardButton", () => {
  it("shares the image as a file when canShare supports files", async () => {
    mockFetchOk();
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    setNavigator({ share: shareMock, canShare: canShareMock });

    const user = userEvent.setup();
    render(<ShareCardButton playerId="p1" playerName="Juan Perez" />);
    await user.click(screen.getByRole("button", { name: es.profile.share }));

    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalledTimes(1);
    const callArg = shareMock.mock.calls[0]![0];
    expect(callArg.title).toBe(es.app.name);
    expect(callArg.text).toBe(es.profile.shareText("Juan Perez"));
    expect(callArg.files[0].name).toBe("carta-juan-perez.png");
  });

  it("falls back to sharing the url when canShare is unavailable but share exists", async () => {
    mockFetchOk();
    const shareMock = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: shareMock, canShare: undefined });

    const user = userEvent.setup();
    render(<ShareCardButton playerId="p1" playerName="Juan" />);
    await user.click(screen.getByRole("button", { name: es.profile.share }));

    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: es.app.name,
        text: es.profile.shareText("Juan"),
        url: expect.stringContaining("/api/og/card/p1"),
      }),
    );
  });

  it("falls back to copying the url to the clipboard when share is unavailable", async () => {
    mockFetchOk();
    setNavigator({ share: undefined, canShare: undefined });
    const writeTextMock = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ShareCardButton playerId="p1" playerName="Juan" />);
    await user.click(screen.getByRole("button", { name: es.profile.share }));

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/api/og/card/p1"));
    expect(toast.success).toHaveBeenCalledWith(es.profile.linkCopied);
  });

  it("ignores an AbortError from a cancelled share, without an error toast", async () => {
    mockFetchOk();
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const shareMock = vi.fn().mockRejectedValue(abortError);
    setNavigator({ share: shareMock, canShare: () => true });

    const user = userEvent.setup();
    render(<ShareCardButton playerId="p1" playerName="Juan" />);
    await user.click(screen.getByRole("button", { name: es.profile.share }));

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("renders a download link to the card image", () => {
    render(<ShareCardButton playerId="p1" playerName="Juan" />);
    const link = screen.getByRole("link", { name: es.profile.downloadCard });
    expect(link).toHaveAttribute("href", "/api/og/card/p1");
    expect(link).toHaveAttribute("download", "carta-juan.png");
  });
});
