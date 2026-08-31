import { expect, test } from "@playwright/test";
import axe from "axe-core";

const memberStorageState = process.env.W8_E2E_MEMBER_STORAGE_STATE;

test.use({
  storageState: memberStorageState ?? { cookies: [], origins: [] },
});

test.describe("W8 authenticated member browser smoke", () => {
  test.skip(
    !memberStorageState,
    "[W8 E2E] Set W8_E2E_MEMBER_STORAGE_STATE to a real authenticated Playwright storage state.",
  );

  test("navigates the Today, Feed, Board, and Me journeys", async ({
    page,
  }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    const navigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await expect(navigation.getByRole("link", { name: "Today" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Board" })).toBeVisible();

    await navigation.getByRole("link", { name: "Feed" }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();

    await navigation.getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board$/);
    await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();

    await page.getByRole("link", { name: "Open Me" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("heading", { name: "Me" })).toBeVisible();
  });

  test("keeps primary navigation keyboard reachable with text state", async ({
    page,
  }) => {
    await page.goto("/today");

    const navigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    for (const label of ["Today", "Feed", "Board"]) {
      const link = navigation.getByRole("link", { name: label });
      await link.focus();
      await expect(link).toBeFocused();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }

    await expect(
      navigation.getByRole("link", { name: "Today" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("runs automated accessibility checks on primary member screens", async ({
    page,
  }) => {
    for (const path of ["/today", "/feed", "/board", "/me"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.addScriptTag({ content: axe.source });

      const violations = await page.evaluate(async () => {
        const axeRuntime = (
          window as Window & {
            axe?: {
              run: (context: Document) => Promise<{
                violations: Array<{
                  id: string;
                  impact: string | null;
                  nodes: unknown[];
                }>;
              }>;
            };
          }
        ).axe;

        if (!axeRuntime) {
          throw new Error("axe-core did not load in the browser context");
        }

        const result = await axeRuntime.run(document);
        return result.violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          nodeCount: nodes.length,
        }));
      });

      expect(violations, `${path} has accessibility violations`).toEqual([]);
    }
  });
});
