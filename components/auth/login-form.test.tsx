import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";
import { es } from "@/messages/es";
import type { ActionResult } from "@/lib/actions/result";

afterEach(cleanup);

vi.mock("@/lib/actions/auth", () => ({
  signInWithOAuth: vi.fn(async (): Promise<ActionResult<void>> => ({
    ok: false,
    error: es.common.error,
  })),
  sendMagicLink: vi.fn(async (_prevState: unknown, formData: FormData): Promise<ActionResult<void>> => {
    const email = formData.get("email");
    if (typeof email !== "string" || !email.includes("@")) {
      return { ok: false, error: es.auth.invalidEmail };
    }
    return { ok: true, data: undefined };
  }),
  signInWithPassword: vi.fn(async (): Promise<ActionResult<void>> => ({
    ok: false,
    error: es.auth.invalidCredentials,
  })),
}));

describe("LoginForm", () => {
  it("renders both tabs and the OAuth buttons", () => {
    render(<LoginForm next="/" />);

    expect(screen.getByRole("button", { name: es.auth.withGoogle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.auth.withDiscord })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: es.auth.magicLinkTab })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: es.auth.passwordTab })).toBeInTheDocument();
  });

  it("shows the invalid email error when submitting a bad email on the magic link form", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/" />);

    await user.type(screen.getByLabelText(es.auth.emailLabel), "not-an-email");
    await user.click(screen.getByRole("button", { name: es.auth.sendMagicLink }));

    expect(await screen.findByText(es.auth.invalidEmail)).toBeInTheDocument();
  });
});
