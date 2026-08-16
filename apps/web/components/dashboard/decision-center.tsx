"use client";

import React, { useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Check, ChevronDown, PencilLine, Search, X } from "lucide-react";

// Ported from the Trezo template (Dashboard/eCommerce/RecentOrders.tsx):
// header with search + dropdown, paginated table with status badges and
// row actions. Re-skinned for ORQ8 (navy/emerald/lime) with the
// Decision Center approval queue content.
type Request = {
  id: string;
  from: string;
  avatar: string; // initials or "agent" marker
  what: string;
  cost: string;
  status: "Awaiting" | "Approved" | "Rejected";
};

const requests: Request[] = [
  {
    id: "#RQ-1042",
    from: "Marketing specialist",
    avatar: "MS",
    what: "requests $250 for a LinkedIn launch campaign",
    cost: "$250",
    status: "Awaiting",
  },
  {
    id: "#RQ-1041",
    from: "Engineer · α",
    avatar: "EN",
    what: "wants to deploy PR #142 to production",
    cost: "$0",
    status: "Awaiting",
  },
  {
    id: "#RQ-1040",
    from: "Writer · α",
    avatar: "WR",
    what: "publishes Launch post v2 to the blog",
    cost: "$0",
    status: "Approved",
  },
  {
    id: "#RQ-1039",
    from: "Researcher · α",
    avatar: "RS",
    what: "buys access to the pricing survey dataset",
    cost: "$40",
    status: "Rejected",
  },
  {
    id: "#RQ-1038",
    from: "Engineer · α",
    avatar: "EN",
    what: "requests a $0.10 API credit top-up for the scraper",
    cost: "$0.10",
    status: "Approved",
  },
  {
    id: "#RQ-1037",
    from: "Writer · α",
    avatar: "WR",
    what: "wants to buy the domain for the launch microsite",
    cost: "$12",
    status: "Awaiting",
  },
  {
    id: "#RQ-1036",
    from: "Marketing specialist",
    avatar: "MS",
    what: "requests access to the analytics dashboard",
    cost: "$0",
    status: "Rejected",
  },
  {
    id: "#RQ-1035",
    from: "Researcher · α",
    avatar: "RS",
    what: "wants to subscribe to the competitor newsletter bundle",
    cost: "$29",
    status: "Approved",
  },
];

const ITEMS_PER_PAGE = 5;

const avatarTone: Record<string, string> = {
  MS: "bg-secondary-50 text-secondary-500",
  EN: "bg-emerald/10 text-emerald-700",
  WR: "bg-purple-50 text-purple-600",
  RS: "bg-amber-50 text-amber-700",
};

const statusTone: Record<Request["status"], string> = {
  Awaiting: "bg-warning-50 text-warning-500",
  Approved: "bg-success-50 text-success-600",
  Rejected: "bg-danger-50 text-danger-500",
};

export function DecisionCenter() {
  const [selectedOption, setSelectedOption] = useState<string>("Show All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = requests.filter((r) => {
    const matchesStatus =
      selectedOption === "Show All" || r.status === selectedOption;
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      r.id.toLowerCase().includes(q) ||
      r.from.toLowerCase().includes(q) ||
      r.what.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const displayed = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="trezo-card mb-[25px] rounded-md bg-white p-[20px] dark:bg-[#0c1427] md:p-[25px]">
      <div className="trezo-card-header mb-[20px] sm:flex sm:items-center sm:justify-between md:mb-[25px]">
        <div className="trezo-card-title">
          <h5 className="!mb-0">Decision Center</h5>
        </div>

        <div className="trezo-card-subtitle sm:flex sm:items-center">
          <form className="relative my-[13px] sm:my-0 sm:mr-[20px] sm:w-[240px]">
            <label className="absolute left-[13px] top-1/2 mt-px -translate-y-1/2 leading-none text-black dark:text-white">
              <Search className="!text-[20px]" />
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search requests....."
              className="block h-[36px] w-full rounded-md border border-gray-50 bg-gray-50 pb-[12px] pl-[38px] pr-[13px] pt-[11px] text-xs text-black outline-0 placeholder:text-gray-500 dark:border-[#15203c] dark:bg-[#15203c] dark:text-white md:pr-[16px] dark:placeholder:text-gray-400"
            />
          </form>

          <div className="trezo-card-subtitle">
            <Menu as="div" className="trezo-card-dropdown relative">
              <MenuButton className="trezo-card-dropdown-btn inline-block rounded-md border border-gray-100 px-[12px] py-[5px] transition-all hover:bg-gray-50 dark:border-[#172036] dark:hover:bg-[#0a0e19] md:px-[19px] md:py-[6.5px]">
                <span className="relative inline-block pr-[17px] md:pr-[20px]">
                  {selectedOption}
                  <ChevronDown className="absolute -right-[3px] top-1/2 h-4 w-4 -translate-y-1/2" />
                </span>
              </MenuButton>

              <MenuItems
                transition
                className="absolute right-0 top-full z-[50] w-[195px] rounded-md bg-white py-[15px] shadow-3xl transition-all data-[closed]:scale-95 data-[closed]:opacity-0 data-[closed]:transform data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in dark:bg-dark"
              >
                {["Show All", "Awaiting", "Approved", "Rejected"].map((option) => (
                  <MenuItem
                    key={option}
                    as="div"
                    className={`block w-full cursor-pointer py-[8px] px-[20px] text-left text-black transition-all hover:bg-gray-50 dark:text-white dark:hover:bg-black ${
                      selectedOption === option ? "font-semibold" : ""
                    }`}
                    onClick={() => {
                      setSelectedOption(option);
                      setCurrentPage(1);
                    }}
                  >
                    {option}
                  </MenuItem>
                ))}
              </MenuItems>
            </Menu>
          </div>
        </div>
      </div>

      <div className="trezo-card-content">
        <div className="table-responsive overflow-x-auto">
          <table className="w-full">
            <thead className="text-black dark:text-white">
              <tr>
                {["Request", "Who", "What", "Cost", "Status", "Action"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap bg-gray-50 px-[20px] py-[11px] font-medium ltr:text-left rtl:text-right dark:bg-[#15203c] ${
                        i === 0 ? "first:rounded-tl-md" : i === 5 ? "first:rounded-tr-md" : ""
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="text-black dark:text-white">
              {displayed.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap border-b border-gray-100 px-[20px] py-[15px] ltr:text-left rtl:text-right dark:border-[#172036]">
                    <span className="font-mono text-xs text-muted">{r.id}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-[20px] py-[15px] dark:border-[#172036]">
                    <div className="flex items-center">
                      <div
                        className={`flex h-[40px] w-[40px] items-center justify-center rounded-md font-mono text-xs font-bold ${avatarTone[r.avatar]}`}
                      >
                        {r.avatar}
                      </div>
                      <div className="ml-[12px]">
                        <span className="block font-medium">{r.from}</span>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-gray-100 px-[20px] py-[15px] dark:border-[#172036]">
                    {r.what}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-[20px] py-[15px] font-mono text-xs tabular-nums ltr:text-left rtl:text-right dark:border-[#172036]">
                    {r.cost}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-[20px] py-[15px] dark:border-[#172036]">
                    <span
                      className={`inline-block rounded-sm px-[8px] py-[3px] font-medium text-xs dark:bg-[#15203c] ${statusTone[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-[20px] py-[15px] dark:border-[#172036]">
                    {r.status === "Awaiting" ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Approve"
                          aria-label={`Approve ${r.id}`}
                          className="rounded-md border border-gray-100 p-1.5 text-emerald-700 transition-all hover:bg-emerald hover:border-emerald hover:text-navy-950"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Modify"
                          aria-label={`Modify ${r.id}`}
                          className="rounded-md border border-gray-100 p-1.5 text-navy-800 transition-all hover:bg-navy-800 hover:border-navy-800 hover:text-white"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Reject"
                          aria-label={`Reject ${r.id}`}
                          className="rounded-md border border-gray-100 p-1.5 text-muted transition-all hover:bg-red-500 hover:border-red-500 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-b-md border-b border-l border-r border-gray-100 px-[20px] py-[12px] sm:flex sm:items-center sm:justify-between dark:border-[#172036] md:py-[14px]">
          <p className="!mb-0 !text-sm">
            Showing {displayed.length} of {filtered.length} results
          </p>

          <ol className="mt-[10px] space-x-1 sm:mt-0">
            <li className="inline-block">
              <button
                type="button"
                className="relative block h-[31px] w-[31px] rounded-md border border-gray-100 text-center leading-[29px] transition-all hover:border-primary-500 hover:bg-primary-500 hover:text-white dark:border-[#172036]"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                <span className="opacity-0">0</span>
                <ChevronDown className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rotate-90" />
              </button>
            </li>

            {[...Array(totalPages)].map((_, index) => (
              <li className="inline-block" key={index}>
                <button
                  className={`relative block h-[31px] w-[31px] rounded-md border text-center leading-[29px] dark:border-[#172036] ${
                    currentPage === index + 1
                      ? "border-primary-500 bg-primary-500 text-white"
                      : "border-gray-100"
                  }`}
                  onClick={() => handlePageChange(index + 1)}
                >
                  {index + 1}
                </button>
              </li>
            ))}

            <li className="inline-block">
              <button
                type="button"
                className="relative block h-[31px] w-[31px] rounded-md border border-gray-100 text-center leading-[29px] transition-all hover:border-primary-500 hover:bg-primary-500 hover:text-white dark:border-[#172036]"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                <span className="opacity-0">0</span>
                <ChevronDown className="absolute left-0 right-0 top-1/2 -translate-y-1/2 -rotate-90" />
              </button>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
