import { afterEach, describe, expect, it } from "vitest";

import { getPublicEnv, getServerEnv } from "@/lib/config/env";

const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INVITE_INTENT_SECRET",
] as const;

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function setValidEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://tracker.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.INVITE_INTENT_SECRET = "x".repeat(32);
}

describe("environment configuration", () => {
  it("reads public env from statically accessed process.env keys", () => {
    setValidEnv();

    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      NEXT_PUBLIC_APP_URL: "https://tracker.example.com",
    });
  });

  it("fails closed when public env keys are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("keeps public env readable when the app origin omits a scheme", () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_APP_URL = "75-soft-seven.vercel.app";

    expect(getPublicEnv().NEXT_PUBLIC_APP_URL).toBe("75-soft-seven.vercel.app");
  });

  it("names the missing variables so a deployment can be diagnosed", () => {
    setValidEnv();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getServerEnv()).toThrow(
      /Server configuration is incomplete: SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("requires server-only invite and service-role values", () => {
    setValidEnv();
    delete process.env.INVITE_INTENT_SECRET;

    expect(() => getServerEnv()).toThrow(/INVITE_INTENT_SECRET/);
  });
});
