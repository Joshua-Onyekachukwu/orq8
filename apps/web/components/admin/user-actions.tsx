"use client";

import { useState } from "react";
import { MoreHorizontal, Shield, Ban, CheckCircle } from "lucide-react";

interface UserActionsProps {
  userId: string;
  currentStatus: string;
}

export function UserActions({ userId, currentStatus }: UserActionsProps) {
  const [open, setOpen] = useState(false);

  const handleAction = async (action: string) => {
    setOpen(false);
    // Actions would call admin API endpoints
    console.log(`Admin action: ${action} on user ${userId}`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-muted hover:bg-canvas transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-hairline bg-white shadow-lg">
            {currentStatus === "active" ? (
              <button
                type="button"
                onClick={() => handleAction("suspend")}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
              >
                <Ban className="h-4 w-4" />
                Suspend User
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAction("enable")}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#1a5c2e] hover:bg-[#1a5c2e]/5 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Enable User
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
