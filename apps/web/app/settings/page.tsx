"use client";

import { useState } from "react";
import Image from "next/image";
import { SettingsShell } from "../../components/settings-shell";

const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800";

const labelClass = "mb-1.5 block text-sm font-medium text-ink";

/**
 * Account settings hub. Sample values for the founder's profile; the save
 * action wires to the members API in Phase 2.
 */
export default function SettingsPage() {
  const [avatar, setAvatar] = useState<string | null>("/images/members/member-1.jpg");
  const [firstName, setFirstName] = useState("Joshua");
  const [lastName, setLastName] = useState("O.");
  const [email, setEmail] = useState("founder@orq8.io");
  const [phone, setPhone] = useState("+1 555 010 2030");
  const [company, setCompany] = useState("ORQ8 Labs");
  const [role, setRole] = useState("Founder & CEO");

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <SettingsShell
      title="Account settings"
      description="Your profile, company details, and how ORQ8 addresses you."
    >
      <form className="max-w-3xl rounded-xl border border-hairline bg-white p-6 sm:p-8">
        {/* Profile photo */}
        <h2 className="text-lg font-semibold text-ink">Profile</h2>
        <p className="mt-1 text-sm text-muted">
          Update your photo and personal details here.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <span className="relative h-16 w-16 overflow-hidden rounded-full border border-hairline">
            {avatar ? (
              <Image
                src={avatar}
                width={64}
                height={64}
                alt="Profile photo"
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-navy-900 text-lg font-bold text-emerald">
                J
              </span>
            )}
          </span>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hairline bg-white px-4 py-2 text-sm font-medium text-navy-800 transition-colors hover:border-navy-800">
              Upload new photo
              <input type="file" accept="image/*" className="sr-only" onChange={onFileChange} />
            </label>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="mt-2 block text-xs font-medium text-red-600 hover:underline"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="first-name" className={labelClass}>
              First name
            </label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="last-name" className={labelClass}>
              Last name
            </label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="company" className={labelClass}>
              Company
            </label>
            <input
              id="company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="role" className={labelClass}>
              Role
            </label>
            <input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Saving wires to the members API in Phase 2
          </p>
          <button
            type="button"
            className="rounded-full bg-navy-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
          >
            Save changes
          </button>
        </div>
      </form>
    </SettingsShell>
  );
}
