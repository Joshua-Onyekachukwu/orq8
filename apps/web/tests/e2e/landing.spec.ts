import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ORQ8/);
    await expect(page.locator("text=ORQ8")).toBeVisible();
  });

  test("has navigation links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/#features"]')).toBeVisible();
    await expect(page.locator('a[href="/pricing"]')).toBeVisible();
  });

  test("has waitlist signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button:has-text("Join the waitlist")')).toBeVisible();
  });

  test("footer has legal links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
    await expect(page.locator('a[href="/security"]')).toBeVisible();
    await expect(page.locator('a[href="/ai-disclosure"]')).toBeVisible();
  });
});

test.describe("Legal Pages", () => {
  test("Privacy Policy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/Privacy Policy/);
    await expect(page.locator("h1")).toContainText("Privacy Policy");
    await expect(page.locator("text=Last updated:")).toBeVisible();
  });

  test("Terms of Service page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveTitle(/Terms of Service/);
    await expect(page.locator("h1")).toContainText("Terms of Service");
  });

  test("Security page loads", async ({ page }) => {
    await page.goto("/security");
    await expect(page).toHaveTitle(/Security/);
    await expect(page.locator("h1")).toContainText("Security Practices");
  });

  test("AI Disclosure page loads", async ({ page }) => {
    await page.goto("/ai-disclosure");
    await expect(page).toHaveTitle(/AI Transparency/);
    await expect(page.locator("h1")).toContainText("AI Transparency Notice");
  });

  test("Privacy Policy has required sections", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("text=Data We Collect")).toBeVisible();
    await expect(page.locator("text=Your Rights")).toBeVisible();
    await expect(page.locator("text=Contact Us")).toBeVisible();
  });

  test("Terms page has required sections", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("text=Acceptable Use")).toBeVisible();
    await expect(page.locator("text=Your Data")).toBeVisible();
    await expect(page.locator("text=Termination")).toBeVisible();
  });
});

test.describe("Cookie Consent", () => {
  test("shows cookie consent banner on first visit", async ({ page }) => {
    // Clear localStorage to simulate first visit
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[role="dialog"][aria-label="Cookie consent"]')).toBeVisible();
    await expect(page.locator('button:has-text("Accept All")')).toBeVisible();
    await expect(page.locator('button:has-text("Essential Only")')).toBeVisible();
  });

  test("cookie consent disappears after accepting", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('button:has-text("Accept All")').click();
    await expect(page.locator('[role="dialog"][aria-label="Cookie consent"]')).not.toBeVisible();
    // Reload and verify it stays hidden
    await page.reload();
    await expect(page.locator('[role="dialog"][aria-label="Cookie consent"]')).not.toBeVisible();
  });
});
