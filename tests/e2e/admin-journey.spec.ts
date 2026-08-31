import { expect, test } from "@playwright/test";

const adminStorageState = process.env.W8_E2E_ADMIN_STORAGE_STATE;

test.use({
  storageState: adminStorageState ?? { cookies: [], origins: [] },
});

test.describe("W8 admin browser journey", () => {
  test.skip(
    !adminStorageState,
    "[W8 E2E] Set W8_E2E_ADMIN_STORAGE_STATE to a real authenticated admin storage state.",
  );

  test("opens the protected admin surface as an admin", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  });
});
