import { expect, test } from "@playwright/test";

test("resumes an interrupted funnel and unlocks protected results after payment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start my assessment" }).click();

  await page.getByRole("button", { name: "Female", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Question 2 of 5")).toBeVisible();

  await page.getByRole("button", { name: /Lose weight/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Question 3 of 5")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Question 3 of 5")).toBeVisible();
  await expect(page.getByText("Tell us a little about your body.")).toBeVisible();

  await page.getByLabel("Age").fill("32");
  await page.getByLabel("Height").fill("165");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Current weight").fill("70");
  await page.getByLabel("Target weight").fill("60");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /Moderately active/ }).click();
  const previewResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/complete") && response.ok(),
  );
  await page.getByRole("button", { name: "Build my plan" }).click();
  const previewResponse = await previewResponsePromise;
  const previewBody = await previewResponse.json();

  expect(previewBody.data.access).toBe("preview");
  expect(previewBody.data).not.toHaveProperty("weeklyProjection");
  expect(previewBody.data).not.toHaveProperty("recommendedDailyCalories");
  expect(previewBody.data.lockedFields).toEqual(
    expect.arrayContaining(["weeklyProjection", "recommendedDailyCalories"]),
  );
  await expect(page.getByText("Your personalized plan is ready")).toBeVisible();
  await expect(page.getByText("Your daily calorie target")).toBeVisible();

  await page.getByRole("button", { name: "Unlock my plan — demo" }).click();
  await expect(page.getByText("Plan unlocked")).toBeVisible();
  await expect(page.getByText("Daily target")).toBeVisible();
  await expect(page.getByRole("img", { name: "Projected weight trend" })).toBeVisible();
});

test("shows server validation without advancing an unreasonable weight target", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start my assessment" }).click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Lose weight/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Age").fill("35");
  await page.getByLabel("Height").fill("180");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Current weight").fill("80");
  await page.getByLabel("Target weight").fill("90");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "A weight-loss target must be below the current weight",
    }),
  ).toBeVisible();
  await expect(page.getByText("Question 4 of 5")).toBeVisible();
});
