import { describe, expect, it } from "vitest";
import {
  applicantSteps, boardApproved, canEditPath, canReadVault, canSeeApplicant, inOrient, isDeclined, laneOf,
  portalLeaks, portalPayload, progress, refStatus, resolveActor, todoItems, type Applicant,
} from "./domain";

const app = (over: Partial<Applicant> = {}): Applicant => ({
  _id: "a1", name: "Pat Example", email: "pat@example.com", type: "Regular", location: "Potsdam",
  app: { received: "2026-10-01", complete: "yes" }, ...over,
});

describe("pipeline", () => {
  it("counts three received references as enough", () => {
    const a = app({ refs: { r1: { name: "A", returned: "2026-10-02" }, r2: { name: "B", returned: "2026-10-03" }, r3: { name: "C", returned: "2026-10-04" }, r4: { name: "D" } } });
    expect(refStatus(a).done).toBe(true);
    expect(refStatus(a).got).toBe(3);
  });
  it("treats a replaced reference as not received", () => {
    const a = app({ refs: { r1: { name: "A", returned: "2026-10-02", replace: "2026-10-05" }, r2: { name: "B", returned: "2026-10-03" }, r3: { name: "C", returned: "2026-10-04" } } });
    expect(refStatus(a).done).toBe(false);
  });
  it("puts a board-approved file on Onboard even if earlier steps are blank", () => {
    const a = app({ board: { result: "approved" } });
    expect(boardApproved(a)).toBe(true);
    expect(inOrient(a)).toBe(true);
    expect(laneOf(a)).toBe("onb");
  });
});

describe("privacy", () => {
  it("does not tell a declined applicant they were denied", () => {
    const a = app({ status: "declined", board: { result: "denied" }, mvr: { violations: "yes" } });
    expect(isDeclined(a)).toBe(true);
    const blob = JSON.stringify(applicantSteps(a));
    expect(blob.toLowerCase()).not.toContain("denied");
    expect(blob.toLowerCase()).not.toContain("declined");
    expect(blob).toContain("membership committee");
  });
  it("keeps license numbers and notes out of the portal payload", () => {
    const a = app({
      board: { result: "denied", for: 1, against: 8 },
      notes: "SECRET-NOTES",
      dl: { date: "2026-10-02", valid: "yes" },
      form: { person: { dlNumber: "SECRET-DL" } },
    });
    const payload = portalPayload(a, {});
    expect(portalLeaks(payload, ["SECRET-DL", "SECRET-NOTES"])).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("against");
  });
});

describe("roles", () => {
  it("gives the owner and full access edit rights, and hides files from members", () => {
    const owner = resolveActor("dkota@pvrs.org", null, "Dkota");
    const full = resolveActor("full@pvrs.org", { role: "full", name: "Full" });
    const admin = resolveActor("admin@pvrs.org", { role: "admin" });
    const interviewer = resolveActor("ivy@pvrs.org", { role: "interviewer" });
    const member = resolveActor("member@pvrs.org", { role: "member" });
    expect(owner.canEdit && full.canEdit).toBe(true);
    expect(canEditPath(admin, "name")).toBe(false);
    expect(canEditPath(admin, "iv.why")).toBe(true);
    expect(canEditPath(resolveActor("c@pvrs.org", { role: "coordinator" }), "sched.scheduled")).toBe(true);
    const assigned = app({ interviewers: ["ivy@pvrs.org"] });
    expect(canSeeApplicant(interviewer, assigned)).toBe(true);
    expect(canSeeApplicant(interviewer, app())).toBe(false);
    expect(canSeeApplicant(member, assigned)).toBe(false);
    expect(canReadVault(admin)).toBe(true);
    expect(canReadVault(interviewer)).toBe(false);
    expect(canReadVault(full)).toBe(true);
  });
  it("welcomes a new application before later steps", () => {
    const items = todoItems([app({ app: { received: "2026-11-01" }, email: "pat@example.com" })], {});
    expect(items.some((t) => t.act === "invite")).toBe(true);
  });
});
