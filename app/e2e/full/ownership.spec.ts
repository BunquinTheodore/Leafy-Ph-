import { expect, newMember, photo, test } from "./support";

test("a second member cannot open, change or delete the first member's scan", async ({
  browser,
  baseURL,
}) => {
  const first = await newMember(browser, baseURL ?? "", "owner");
  const second = await newMember(browser, baseURL ?? "", "intruder");
  try {
    await first.page.goto("/scan");
    await first.page.getByTestId("photo-input").setInputFiles(photo("peach.jpg"));
    await first.page.getByRole("button", { name: "Analyze leaf" }).click();
    await expect(first.page.getByTestId("result-view")).toBeVisible({ timeout: 45_000 });

    await first.page.goto("/scans");
    const link = first.page.getByTestId("history-card").first().getByRole("link").first();
    const scanId = /\/scans\/([0-9a-f-]{36})/.exec((await link.getAttribute("href")) ?? "")?.[1];
    expect(scanId).toBeTruthy();

    // The owner still sees it.
    expect((await first.page.request.get(`/api/scans/${scanId}`)).status()).toBe(200);

    // The other member gets a real 404 status (not a 200 that streams a not found page) and
    // a plain 404 on every API route.
    const opened = await second.page.goto(`/scans/${scanId}`);
    expect(opened?.status()).toBe(404);
    await expect(second.page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(second.page.getByTestId("result-view")).toHaveCount(0);

    const headers = { origin: baseURL ?? "" };
    expect((await second.page.request.get(`/api/scans/${scanId}`)).status()).toBe(404);
    const feedback = await second.page.request.put(`/api/scans/${scanId}/feedback`, {
      headers,
      data: { is_correct: true },
    });
    expect(feedback.status()).toBe(404);
    const retry = await second.page.request.post(`/api/scans/${scanId}/retry`, { headers });
    expect(retry.status()).toBe(404);
    const removal = await second.page.request.delete(`/api/scans/${scanId}`, { headers });
    expect(removal.status()).toBe(404);

    // Their own history is empty and the owner's scan is untouched.
    await second.page.goto("/scans");
    await expect(second.page.getByRole("heading", { name: "No scans yet" })).toBeVisible();
    expect((await first.page.request.get(`/api/scans/${scanId}`)).status()).toBe(200);
  } finally {
    await first.close();
    await second.close();
  }
});

test("scan routes need a session", async ({ request, baseURL }) => {
  expect((await request.get(`${baseURL}/api/scans`)).status()).toBe(401);
});
