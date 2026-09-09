import { test, expect } from "@playwright/test";

/**
 * Full authenticated user journey against the configured BASE_URL.
 *
 * Requires TEST_USER_EMAIL / TEST_USER_PASSWORD (see apps/web/.env.e2e.local,
 * gitignored). The profile edit is self-restoring: the original display name
 * is captured before mutation and restored in a finally block.
 */

const NEW_NAME_PREFIX = "Playwright Bot";

test.describe("Authenticated user journey", () => {
  test.skip(!process.env.TEST_USER_EMAIL, "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run the journey");

  test("login → profile edit → save → refresh → identity consistency → logout", async ({ page }) => {
    const newName = `${NEW_NAME_PREFIX} ${Date.now()}`;
    let originalName: string | null = null;

    try {
      // ── 1. Login ──────────────────────────────────────────────────────
      await test.step("login with test account", async () => {
        await page.goto("/login");
        await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
        await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/app/, { timeout: 20_000 });
        await expect(page.locator("nav, [role=navigation]").first()).toBeVisible();
      });

      // ── 2. Profile page loads with identity ──────────────────────────
      await test.step("open profile page", async () => {
        await page.goto("/app/profile");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
        // Capture the pre-edit display name for restoration.
        const nameEl = page.locator("h1 + * , h1").first(); // fallback below reads via edit field
        void nameEl;
        // The displayed name paragraph sits next to the Edit button.
        const nameText = await page
          .locator('button[title="Edit name"]')
          .locator("xpath=preceding-sibling::span[1]")
          .textContent()
          .catch(() => null);
        originalName = nameText && nameText.trim().length > 0 ? nameText.trim() : null;
      });

      // ── 3. Edit name, save, see success confirmation ─────────────────
      await test.step("edit name and save", async () => {
        await page.locator('button[title="Edit name"]').click();
        const input = page.locator('input[placeholder="Your name"]');
        await expect(input).toBeVisible();
        await input.fill(newName);
        // Save button is the icon button right after the input (lucide save icon).
        const saveButton = input.locator("xpath=following-sibling::button[1]");
        await expect(saveButton).toBeEnabled();
        await saveButton.click();
        await expect(page.locator('[role="status"]')).toContainText(/updated successfully/i, {
          timeout: 15_000,
        });
      });

      // ── 4. Immediate UI reflects the new name (no reload) ────────────
      await test.step("profile banner shows new name immediately", async () => {
        await expect(page.locator('button[title="Edit name"]').locator("xpath=preceding-sibling::span[1]")).toHaveText(
          newName,
        );
      });

      // ── 5. Refresh: persistence from the server ──────────────────────
      await test.step("name persists after refresh", async () => {
        await page.reload();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('button[title="Edit name"]').locator("xpath=preceding-sibling::span[1]")).toHaveText(
          newName,
          { timeout: 15_000 },
        );
      });

      // ── 6. Identity consistency: sidebar + top-bar ───────────────────
      await test.step("sidebar and top-bar show the same new identity", async () => {
        // The app shell (layout) fetches identity server-side — navigate to
        // a fresh server render rather than trusting client state.
        await page.goto("/app");
        await expect(page.locator("nav, [role=navigation]").first()).toBeVisible({ timeout: 20_000 });

        // Sidebar identity block renders userName with orgName beneath it.
        await expect(page.locator('nav p, [role=navigation] p').filter({ hasText: newName }).first()).toBeVisible({
          timeout: 15_000,
        });

        // Top-bar: open the profile dropdown and verify the name there too.
        const header = page.locator("header");
        const profileTrigger = header
          .getByRole("button")
          .filter({ has: page.locator("svg.lucide-chevron-down") })
          .last();
        await profileTrigger.click();
        await expect(header.getByText(newName).first()).toBeVisible({ timeout: 10_000 });
      });

      // ── 7. Logout ─────────────────────────────────────────────────────
      await test.step("sign out", async () => {
        const signOut = page.locator('button:has-text("Sign out")').first();
        await expect(signOut).toBeVisible();
        await signOut.click();
        await page.waitForURL(/login|logout/, { timeout: 20_000 });
        // Session is really gone: the protected route bounces back to login.
        await page.goto("/app");
        await expect(page).toHaveURL(/login/, { timeout: 20_000 });
      });
    } finally {
      // ── Restore the original display name ─────────────────────────────
      if (originalName && originalName !== newName) {
        try {
          await page.goto("/login");
          await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
          await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(/\/app/, { timeout: 20_000 });
          await page.goto("/app/profile");
          await page.locator('button[title="Edit name"]').click({ timeout: 15_000 });
          const input = page.locator('input[placeholder="Your name"]');
          await input.fill(originalName);
          await input.locator("xpath=following-sibling::button[1]").click();
          await expect(page.locator('[role="status"]')).toContainText(/updated successfully/i, {
            timeout: 15_000,
          });
        } catch {
          // Best-effort restore — account is a disposable E2E namespace.
        }
      }
    }
  });
});
