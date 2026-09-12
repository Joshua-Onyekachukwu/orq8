import { test, expect } from "@playwright/test";

/**
 * Full authenticated user journey against the configured BASE_URL.
 *
 * Requires TEST_USER_EMAIL / TEST_USER_PASSWORD (see apps/web/.env.e2e.local,
 * gitignored). The profile edit is self-restoring: the original display name
 * is captured before mutation and restored in a finally block.
 *
 * Note: the app shell caches its identity fetch for 30s (next: revalidate 30),
 * so the sidebar/top-bar consistency step polls past that window.
 */

const NEW_NAME_PREFIX = "Playwright Bot";

test.describe("Authenticated user journey", () => {
  test.skip(!process.env.TEST_USER_EMAIL, "Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run the journey");

  test("login → profile edit → save → refresh → identity consistency → logout", async ({ page }) => {
    // Shell identity revalidates on a 30s window; the consistency poll must fit.
    test.setTimeout(180_000);
    const newName = `${NEW_NAME_PREFIX} ${Date.now()}`;
    let originalName: string | null = null;

    // The display name is the first span inside the identity paragraph that
    // owns the "Edit name" button (followed by a text-less verified badge).
    const nameSpan = page.locator('p:has(button[title="Edit name"]) > span').first();

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
        await expect(page.locator('button[title="Edit name"]')).toBeVisible({ timeout: 20_000 });
        const nameText = await nameSpan.textContent();
        originalName = nameText && nameText.trim().length > 0 ? nameText.trim() : null;
      });

      // ── 3. Edit name, save, see success confirmation ─────────────────
      await test.step("edit name and save", async () => {
        await page.locator('button[title="Edit name"]').click();
        const input = page.locator('input[placeholder="Your name"]');
        await expect(input).toBeVisible();
        await input.fill(newName);
        // Save button is the icon button right after the input.
        const saveButton = input.locator("xpath=following-sibling::button[1]");
        await expect(saveButton).toBeEnabled();
        await saveButton.click();
        // Scoped by text: the unverified-email banner also uses role="status".
        await expect(page.getByText("Profile updated successfully")).toBeVisible({
          timeout: 15_000,
        });
      });

      // ── 4. Immediate UI reflects the new name (no reload) ────────────
      await test.step("profile banner shows new name immediately", async () => {
        await expect(nameSpan).toHaveText(newName);
      });

      // ── 5. Refresh: persistence from the server ──────────────────────
      await test.step("name persists after refresh", async () => {
        await page.reload();
        await expect(page.locator('button[title="Edit name"]')).toBeVisible({ timeout: 20_000 });
        await expect(nameSpan).toHaveText(newName, { timeout: 15_000 });
      });

      // ── 6. Identity consistency: sidebar + top-bar ───────────────────
      await test.step("sidebar and top-bar show the same new identity", async () => {
        // The app shell re-renders identity server-side; its /me fetch is
        // cached for 30s, so poll with reloads past that window.
        await page.goto("/app");
        const deadline = Date.now() + 90_000;
        let sidebarHasNew = false;
        while (Date.now() < deadline) {
          // The identity block lives in the sidebar's user-account button
          // (a sibling of <nav>, not a descendant).
          sidebarHasNew = await page
            .locator('button[aria-label="User account menu"]')
            .locator("p", { hasText: newName })
            .first()
            .isVisible()
            .catch(() => false);
          if (sidebarHasNew) break;
          await page.waitForTimeout(6_000);
          await page.reload();
          await page.locator('button[aria-label="User account menu"]').waitFor({ state: "visible", timeout: 15_000 });
        }
        expect(sidebarHasNew, "sidebar identity should reflect the saved name").toBeTruthy();

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
          // A failure before logout leaves an active session — /login may
          // bounce to /app. Go straight to the profile and log in only if
          // the session is actually gone.
          await page.goto("/app/profile");
          const editBtn = page.locator('button[title="Edit name"]');
          try {
            await editBtn.waitFor({ state: "visible", timeout: 10_000 });
          } catch {
            await page.goto("/login");
            await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
            await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
            await page.locator('button[type="submit"]').click();
            await page.waitForURL(/\/app/, { timeout: 20_000 });
            await page.goto("/app/profile");
            await editBtn.waitFor({ state: "visible", timeout: 15_000 });
          }
          await editBtn.click();
          const input = page.locator('input[placeholder="Your name"]');
          await input.fill(originalName);
          await input.locator("xpath=following-sibling::button[1]").click();
          await expect(page.getByText("Profile updated successfully")).toBeVisible({
            timeout: 15_000,
          });
        } catch {
          // Best-effort restore — account is a disposable E2E namespace.
        }
      }
    }
  });
});
