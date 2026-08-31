import { expect, test } from "@playwright/test";

const privateFieldPattern =
  /access[_-]?token|refresh[_-]?token|service[_-]?role|code_(digest|ciphertext)|raw(day)?events|day[_-]?deltas|optional[_-]?goal[_-]?logs|private[_-]?photo[_-]?path/i;

function expectNoPrivateFields(value: string): void {
  expect(value).not.toMatch(privateFieldPattern);
}

test("does not serialize private data on the public invite page", async ({
  page,
}) => {
  await page.goto("/invite");
  expectNoPrivateFields(await page.content());
});

const memberStorageState = process.env.W8_E2E_MEMBER_STORAGE_STATE;

test.describe("W8 authenticated privacy boundary", () => {
  test.skip(
    !memberStorageState,
    "[W8 E2E] Set W8_E2E_MEMBER_STORAGE_STATE to inspect authenticated response privacy.",
  );
  test.use({
    storageState: memberStorageState ?? { cookies: [], origins: [] },
  });

  test("keeps private source fields out of rendered and JSON responses", async ({
    page,
  }) => {
    const responseBodies: Promise<string>[] = [];
    page.on("response", (response) => {
      const resourceType = response.request().resourceType();
      if (
        resourceType === "document" ||
        resourceType === "xhr" ||
        resourceType === "fetch"
      ) {
        responseBodies.push(response.text().catch(() => ""));
      }
    });

    await page.goto("/today");
    await page.waitForLoadState("networkidle");

    expectNoPrivateFields(await page.content());
    for (const body of await Promise.all(responseBodies)) {
      expectNoPrivateFields(body);
    }
  });
});
