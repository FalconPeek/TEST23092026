import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { PrefsForm } from "./prefs-form";
import { es } from "@/messages/es";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUpdateNotificationPrefs = vi.fn();
vi.mock("@/lib/actions/engagement", () => ({
  updateNotificationPrefs: (...args: unknown[]) => mockUpdateNotificationPrefs(...args),
}));

const mockIsPushSupported = vi.fn();
const mockGetPushPermission = vi.fn();
const mockSubscribeToPush = vi.fn();
const mockUnsubscribeFromPush = vi.fn();
vi.mock("@/lib/push/client", () => ({
  isPushSupported: () => mockIsPushSupported(),
  getPushPermission: () => mockGetPushPermission(),
  subscribeToPush: () => mockSubscribeToPush(),
  unsubscribeFromPush: () => mockUnsubscribeFromPush(),
}));

describe("PrefsForm notification toggles", () => {
  it("calls updateNotificationPrefs with only the toggled kind", async () => {
    mockIsPushSupported.mockReturnValue(false);
    mockUpdateNotificationPrefs.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<PrefsForm initialPrefs={{}} />);

    const scheduledSwitch = screen.getByText(es.notificationsUi.kinds.match_scheduled).closest("label")!.querySelector('button[role="switch"]')!;
    await user.click(scheduledSwitch);

    expect(mockUpdateNotificationPrefs).toHaveBeenCalledWith({ prefs: { match_scheduled: false } });
  });

  it("reverts the toggle and shows an error toast when the action fails", async () => {
    mockIsPushSupported.mockReturnValue(false);
    mockUpdateNotificationPrefs.mockResolvedValue({ ok: false, error: "algo salió mal" });
    const user = userEvent.setup();
    render(<PrefsForm initialPrefs={{}} />);

    const scheduledSwitch = screen.getByText(es.notificationsUi.kinds.match_scheduled).closest("label")!.querySelector('button[role="switch"]')!;
    expect(scheduledSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(scheduledSwitch);

    // The optimistic flip happens immediately, but the mocked action rejects it right away too;
    // what matters is that it settles back to "on" (never sticks as toggled-off) with an error toast.
    await waitFor(() => expect(scheduledSwitch).toHaveAttribute("aria-checked", "true"));
    expect(toast.error).toHaveBeenCalledWith("algo salió mal");
  });

  it("defaults every kind to on when no prefs are stored", () => {
    mockIsPushSupported.mockReturnValue(false);
    render(<PrefsForm initialPrefs={{}} />);

    for (const label of Object.values(es.notificationsUi.kinds)) {
      const el = screen.getByText(label).closest("label")!.querySelector('button[role="switch"]')!;
      expect(el).toHaveAttribute("aria-checked", "true");
    }
  });

  it("respects a stored false preference", () => {
    mockIsPushSupported.mockReturnValue(false);
    render(<PrefsForm initialPrefs={{ card_updated: false }} />);

    const el = screen.getByText(es.notificationsUi.kinds.card_updated).closest("label")!.querySelector('button[role="switch"]')!;
    expect(el).toHaveAttribute("aria-checked", "false");
  });
});

describe("PrefsForm push section states", () => {
  it("shows the unsupported message when push isn't supported", () => {
    mockIsPushSupported.mockReturnValue(false);
    render(<PrefsForm initialPrefs={{}} />);
    expect(screen.getByText(es.notificationsUi.pushUnsupported)).toBeInTheDocument();
  });

  it("shows the denied message when notifications were blocked", () => {
    mockIsPushSupported.mockReturnValue(true);
    mockGetPushPermission.mockReturnValue("denied");
    render(<PrefsForm initialPrefs={{}} />);
    expect(screen.getByText(es.notificationsUi.pushDenied)).toBeInTheDocument();
  });

  it("shows the enabled state with a disable button when permission is already granted", () => {
    mockIsPushSupported.mockReturnValue(true);
    mockGetPushPermission.mockReturnValue("granted");
    render(<PrefsForm initialPrefs={{}} />);
    expect(screen.getByText(es.notificationsUi.pushEnabled)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.notificationsUi.pushDisable })).toBeInTheDocument();
  });

  it("shows an enable button by default and enables push on click", async () => {
    mockIsPushSupported.mockReturnValue(true);
    mockGetPushPermission.mockReturnValue("default");
    // Mirrors the real subscribeToPush(), which calls Notification.requestPermission() -- the
    // permission genuinely changes as a side effect, which is what getPushStatusSnapshot re-reads
    // on the next render (no local "enabled" state is kept for this).
    mockSubscribeToPush.mockImplementation(async () => {
      mockGetPushPermission.mockReturnValue("granted");
      return { ok: true };
    });
    const user = userEvent.setup();
    render(<PrefsForm initialPrefs={{}} />);

    const enableButton = screen.getByRole("button", { name: es.notificationsUi.pushEnable });
    await user.click(enableButton);

    expect(mockSubscribeToPush).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(es.notificationsUi.pushEnabled)).toBeInTheDocument());
  });
});
