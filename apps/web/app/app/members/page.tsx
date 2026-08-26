"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Eye, Pencil, Search, Trash2 } from "lucide-react";

/**
 * Members & Roles, adapted from the Trezo MembersTable base: a searchable,
 * paginated roster. The org's members are the humans plus the agents they
 * hire. Sample data until the members API lands in Phase 2 (docs/49).
 */
type Member = {
  id: string;
  name: string;
  email: string;
  dept: string;
  role: "CEO" | "Admin" | "Member" | "Agent";
  joined: string;
  lastActive: string;
  image?: string;
  agent?: boolean;
};

const membersData: Member[] = [
  {
    id: "#M-001",
    name: "Joshua O.",
    email: "founder@orq8.io",
    dept: "Leadership",
    role: "CEO",
    joined: "Day 1",
    lastActive: "Now",
    image: "/images/members/member-1.jpg",
  },
  {
    id: "#A-102",
    name: "Researcher · α",
    email: "researcher@orq8.internal",
    dept: "Marketing",
    role: "Agent",
    joined: "Day 1",
    lastActive: "09:41 today",
    agent: true,
  },
  {
    id: "#A-103",
    name: "Writer · α",
    email: "writer@orq8.internal",
    dept: "Marketing",
    role: "Agent",
    joined: "Day 1",
    lastActive: "09:12 today",
    agent: true,
  },
  {
    id: "#A-104",
    name: "Engineer · α",
    email: "engineer@orq8.internal",
    dept: "Engineering",
    role: "Agent",
    joined: "Day 1",
    lastActive: "08:47 today",
    agent: true,
  },
  {
    id: "#A-105",
    name: "Analyst · α",
    email: "analyst@orq8.internal",
    dept: "Operations",
    role: "Agent",
    joined: "Day 1",
    lastActive: "Paused",
    agent: true,
  },
  {
    id: "#M-006",
    name: "Amara Chen",
    email: "amara@orq8.io",
    dept: "Marketing",
    role: "Admin",
    joined: "10 Aug 2026",
    lastActive: "01 Aug 2026",
    image: "/images/members/member-2.jpg",
  },
  {
    id: "#M-007",
    name: "Diego Marquez",
    email: "diego@orq8.io",
    dept: "Engineering",
    role: "Admin",
    joined: "28 Jul 2026",
    lastActive: "30 Jul 2026",
    image: "/images/members/member-3.jpg",
  },
  {
    id: "#M-008",
    name: "Priya Nair",
    email: "priya@orq8.io",
    dept: "Marketing",
    role: "Member",
    joined: "15 Jul 2026",
    lastActive: "27 Jul 2026",
    image: "/images/members/member-4.jpg",
  },
  {
    id: "#M-009",
    name: "Tom Becker",
    email: "tom@orq8.io",
    dept: "Operations",
    role: "Member",
    joined: "02 Jul 2026",
    lastActive: "25 Jul 2026",
    image: "/images/members/member-5.jpg",
  },
  {
    id: "#M-010",
    name: "Sofia Reyes",
    email: "sofia@orq8.io",
    dept: "Engineering",
    role: "Member",
    joined: "18 Jun 2026",
    lastActive: "22 Jul 2026",
    image: "/images/members/member-6.jpg",
  },
  {
    id: "#M-011",
    name: "Kwame Osei",
    email: "kwame@orq8.io",
    dept: "Operations",
    role: "Member",
    joined: "05 Jun 2026",
    lastActive: "20 Jul 2026",
    image: "/images/members/member-7.jpg",
  },
  {
    id: "#M-012",
    name: "Hana Yoshida",
    email: "hana@orq8.io",
    dept: "Marketing",
    role: "Member",
    joined: "22 May 2026",
    lastActive: "18 Jul 2026",
    image: "/images/members/member-8.jpg",
  },
];

const roleStyles: Record<Member["role"], string> = {
  CEO: "bg-lime/20 text-navy-900",
  Admin: "bg-indigo-50 text-indigo-700",
  Member: "bg-canvas text-muted",
  Agent: "bg-emerald/15 text-emerald-700",
};

const rowsPerPage = 8;

export default function MembersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(
    () =>
      membersData.filter(
        (m) =>
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.email.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const displayed = filtered.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Organization · {membersData.length} members
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Members &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted">
            The humans and agents in your company, with the authority each one
            holds.
          </p>
        </div>
      </header>

      <div className="mt-6 rounded-xl border border-hairline bg-white">
        <div className="border-b border-hairline px-5 py-4">
          <label className="relative block max-w-xs">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search member here..."
              className="w-full rounded-lg border border-hairline bg-canvas py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {["ID", "Member", "Email", "Department", "Role", "Joined", "Last active", "Action"].map(
                  (h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {displayed.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-canvas/60">
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">
                    {m.id}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {m.image ? (
                        <Image
                          src={m.image}
                          width={40}
                          height={40}
                          className="rounded-full"
                          alt={m.name}
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                          {m.name.charAt(0)}
                        </span>
                      )}
                      <span className="text-sm font-medium text-ink">{m.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                    {m.email}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                    {m.dept}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${roleStyles[m.role]}`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                    {m.joined}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                    {m.lastActive}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="View"
                        aria-label={`View ${m.name}`}
                        className="rounded-lg p-1.5 text-navy-800 transition-colors hover:bg-canvas"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${m.name}`}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove"
                        aria-label={`Remove ${m.name}`}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="text-sm text-muted">
            Showing {displayed.length} of {filtered.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Previous page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-900 text-xs font-semibold text-white">
              {safePage}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-muted">
        Sample roster · invitations and roles land in Phase 2
      </p>
    </div>
  );
}
