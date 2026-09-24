import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupSettingsForm } from "./group-settings-form";
import { es } from "@/messages/es";
import { defaultGroupSettings } from "@/lib/settings/group";

afterEach(cleanup);

const mockUpdateGroup = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/groups", () => ({
  updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
}));

describe("GroupSettingsForm", () => {
  it("renders the default values", () => {
    render(
      <GroupSettingsForm groupId="g1" initialName="Los del jueves" initialSettings={defaultGroupSettings} />,
    );

    expect(screen.getByLabelText(es.groupSettings.nameLabel)).toHaveValue("Los del jueves");
    expect(screen.getByLabelText(es.groupSettings.reportHoursLabel)).toHaveValue(
      defaultGroupSettings.windows.report_hours,
    );
    expect(screen.getByLabelText(es.groupSettings.ratingHoursLabel)).toHaveValue(
      defaultGroupSettings.windows.rating_hours,
    );
  });

  it("blocks submit and shows an error for an out-of-range value", async () => {
    const user = userEvent.setup();
    render(
      <GroupSettingsForm groupId="g1" initialName="Los del jueves" initialSettings={defaultGroupSettings} />,
    );

    const reportHours = screen.getByLabelText(es.groupSettings.reportHoursLabel);
    await user.clear(reportHours);
    await user.type(reportHours, "0");
    await user.click(screen.getByRole("button", { name: es.common.save }));

    expect(mockUpdateGroup).not.toHaveBeenCalled();
    expect(screen.getByText(es.errors.fieldRange(1, 24 * 14))).toBeInTheDocument();
  });

  it("blocks submit with a required-field error when a number input is cleared entirely", async () => {
    const user = userEvent.setup();
    render(
      <GroupSettingsForm groupId="g1" initialName="Los del jueves" initialSettings={defaultGroupSettings} />,
    );

    const reportHours = screen.getByLabelText(es.groupSettings.reportHoursLabel);
    await user.clear(reportHours);
    expect(reportHours).toHaveValue(null);
    await user.click(screen.getByRole("button", { name: es.common.save }));

    expect(mockUpdateGroup).not.toHaveBeenCalled();
    expect(screen.getByText(es.groupSettings.required)).toBeInTheDocument();
  });

  it("restores defaults on reset after a field was changed", async () => {
    const user = userEvent.setup();
    render(
      <GroupSettingsForm groupId="g1" initialName="Los del jueves" initialSettings={defaultGroupSettings} />,
    );

    const reportHours = screen.getByLabelText(es.groupSettings.reportHoursLabel);
    await user.clear(reportHours);
    await user.type(reportHours, "24");
    expect(reportHours).toHaveValue(24);

    await user.click(screen.getByRole("button", { name: es.groupSettings.resetDefaults }));

    expect(screen.getByLabelText(es.groupSettings.reportHoursLabel)).toHaveValue(
      defaultGroupSettings.windows.report_hours,
    );
  });

  it("submits parsed settings on valid input", async () => {
    mockUpdateGroup.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(
      <GroupSettingsForm groupId="g1" initialName="Los del jueves" initialSettings={defaultGroupSettings} />,
    );

    const reportHours = screen.getByLabelText(es.groupSettings.reportHoursLabel);
    await user.clear(reportHours);
    await user.type(reportHours, "24");
    await user.click(screen.getByRole("button", { name: es.common.save }));

    expect(mockUpdateGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "g1",
        name: "Los del jueves",
        settings: expect.objectContaining({
          windows: expect.objectContaining({ report_hours: 24 }),
        }),
      }),
    );
  });
});
