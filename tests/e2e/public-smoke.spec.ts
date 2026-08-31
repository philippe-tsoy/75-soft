import { expect, test } from "@playwright/test";

const privateFieldPattern =
  /access[_-]?token|refresh[_-]?token|service[_-]?role|code_(digest|ciphertext)|raw(day)?events|day[_-]?deltas|optional[_-]?goal[_-]?logs|private[_-]?photo[_-]?path/i;

const hasInviteValidationEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.INVITE_INTENT_SECRET,
);

test.describe("W8 public browser smoke", () => {
  test("keeps an invalid invite on the invite screen", async ({ page }) => {
    test.skip(
      !hasInviteValidationEnvironment,
      "[W8 E2E] Invalid-invite validation is skipped until public Supabase values, service-role key, and invite secret are configured.",
    );

    await page.goto("/invite?code=invalid");

    await expect(page).toHaveURL(/\/invite(?:\?code=invalid)?$/);
    await expect(
      page.getByRole("heading", { name: "Join 75 Soft" }),
    ).toBeVisible();
    await expect(page.getByLabel("Invite code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/signup$/);
  });

  test("exposes accessible auth controls and no private fields", async ({
    page,
  }) => {
    await page.goto("/invite");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const inviteCode = page.getByLabel("Invite code");
    await expect(inviteCode).toHaveAttribute("id", "invite-code");
    await inviteCode.focus();
    await expect(inviteCode).toBeFocused();

    const continueButton = page.getByRole("button", { name: "Continue" });
    const buttonBox = await continueButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox?.width).toBeGreaterThanOrEqual(44);

    expect(await page.content()).not.toMatch(privateFieldPattern);
  });
});
