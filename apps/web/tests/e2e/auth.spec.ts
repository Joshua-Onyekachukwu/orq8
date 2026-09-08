import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=\"email\"]")).toBeVisible();
    await expect(page.locator("input[type=\"password\"]")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[type=\"email\"]")).toBeVisible();
    await expect(page.locator("input[type=\"password\"]")).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("nonexistent@test.com");
    await page.locator('input[type="password"]').fill("wrongpassword123");
    await page.locator('button[type="submit"]').click();
    // Should show an error message (exact text depends on implementation)
    await expect(page.locator('[role="alert"], text=Invalid, text=error, text=failed')).toBeVisible({ timeout: 10_000 });
  });

  test("protected routes redirect to login", async ({ page }) => {
    await page.goto("/app");
    // Should redirect to login when not authenticated
    await expect(page).toHaveURL(/login/);
  });

  test("admin routes redirect to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/);
  });
});
