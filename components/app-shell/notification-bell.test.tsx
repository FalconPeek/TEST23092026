import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NotificationBell } from "./notification-bell";
import { es } from "@/messages/es";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

let latestCallback: ((payload: unknown) => void) | null = null;
const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn();
const mockOn = vi.fn((_event: string, _config: unknown, callback: (payload: unknown) => void) => {
  latestCallback = callback;
  return { subscribe: mockSubscribe };
});
const mockChannel = vi.fn(() => ({ on: mockOn }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: mockChannel, removeChannel: mockRemoveChannel }),
}));

describe("NotificationBell", () => {
  it("renders the initial unread count", () => {
    render(<NotificationBell userId="u1" initialCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders no count badge when there are no unread notifications", () => {
    render(<NotificationBell userId="u1" initialCount={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("caps the displayed count at 99+", () => {
    render(<NotificationBell userId="u1" initialCount={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("links to the notifications page", () => {
    render(<NotificationBell userId="u1" initialCount={0} />);
    expect(screen.getByRole("link", { name: es.notificationsUi.title })).toHaveAttribute(
      "href",
      "/notificaciones",
    );
  });

  it("subscribes to a realtime channel on mount and removes it on unmount, without duplicating on re-render", () => {
    const { rerender, unmount } = render(<NotificationBell userId="u1" initialCount={0} />);

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannel).toHaveBeenCalledWith("notifications-u1");
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    rerender(<NotificationBell userId="u1" initialCount={0} />);
    expect(mockChannel).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it("increments the count when a new notification row insert fires", () => {
    render(<NotificationBell userId="u1" initialCount={0} />);
    expect(latestCallback).not.toBeNull();

    act(() => {
      latestCallback!({ new: { payload: { title: "Hola", body: "Mensaje", url: "/g/1" } } });
    });

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
