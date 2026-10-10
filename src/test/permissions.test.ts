import { describe, it, expect } from "vitest";
import { applyHardOverrides, baselineFor } from "@/hooks/usePermissions";

describe("permissions hard overrides", () => {
  it("denies settings to non-admin roles", () => {
    const base = { canView: true, canCreate: true, canEdit: true, canDelete: true };
    expect(applyHardOverrides("member", "settings", null, base)).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("denies financial reports to non-admin roles", () => {
    const base = { canView: true, canCreate: true, canEdit: true, canDelete: true };
    expect(applyHardOverrides("manager", "financial", "reports", base)).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("keeps unrelated permissions untouched", () => {
    const base = { canView: true, canCreate: false, canEdit: false, canDelete: false };
    expect(applyHardOverrides("member", "clients", null, base)).toEqual(base);
  });
});

describe("baselineFor", () => {
  it("gives full access to owner", () => {
    expect(baselineFor("owner", "financial", "reports")).toEqual({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it("denies settings baseline to non-admin", () => {
    expect(baselineFor("member", "settings", null)).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("denies viewer baseline outside allowed modules", () => {
    expect(baselineFor("viewer", "clients", null)).toEqual({
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });
});
