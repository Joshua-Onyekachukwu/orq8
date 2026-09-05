"use client";

import { useEffect } from "react";
import { identifyUser } from "../lib/analytics";

/**
 * Attach the signed-in user (and their org) to the PostHog session.
 * Mount inside authed layouts after fetching the session. Does not emit
 * events and never sends email/password/credentials — only ORQ8 IDs plus
 * the safe profile fields the caller opts into.
 */
export function IdentifyUser({
  userId,
  orgId,
  userName,
  userEmail,
}: {
  userId?: string;
  orgId?: string;
  userName?: string;
  userEmail?: string;
}) {
  useEffect(() => {
    if (!userId) return;
    identifyUser(userId, {
      org_id: orgId,
      name: userName,
      email: userEmail,
    });
  }, [userId, orgId, userName, userEmail]);

  return null;
}
