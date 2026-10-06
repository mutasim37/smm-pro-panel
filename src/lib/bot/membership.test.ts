import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { checkMembership, type ChannelMember } from "./membership";

const expect = (actual: unknown) => ({ toBe: (expected: unknown) => assert.equal(actual, expected) });

describe("force join", () => {
  test("new and existing non-members are blocked", async () => {
    for (const id of [101, 202, 8872393234, 7547369708]) {
      expect(await checkMembership("@channel", id, async () => ({ status: "left" }))).toBe(false);
    }
  });
  test("joining allows access and leaving blocks the very next interaction", async () => {
    let member: ChannelMember = { status: "member" };
    let calls = 0;
    const lookup = async () => { calls++; return member; };
    expect(await checkMembership("@channel", 101, lookup)).toBe(true);
    member = { status: "left" };
    expect(await checkMembership("@channel", 101, lookup)).toBe(false);
    member = { status: "member" };
    expect(await checkMembership("@channel", 101, lookup)).toBe(true);
    expect(calls).toBe(3);
  });
  test("failed verification does not allow access", async () => {
    expect(await checkMembership("@channel", 101, async () => null)).toBe(false);
    expect(await checkMembership("@channel", 101, async () => { throw new Error("unavailable"); })).toBe(false);
  });
  test("a disabled force channel does not restrict users", async () => {
    expect(await checkMembership("", 101, async () => null)).toBe(true);
  });
});