import { expect, test } from "@playwright/test";

test("health endpoint returns the service contract", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    data: {
      service: "75-soft",
      status: "ok",
    },
  });
});

test("invite page renders the auth shell without a session", async ({
  page,
}) => {
  await page.goto("/invite");

  await expect(
    page.getByRole("heading", { name: "Join 75 Soft" }),
  ).toBeVisible();
  await expect(page.getByLabel("Invite code")).toBeVisible();
});
