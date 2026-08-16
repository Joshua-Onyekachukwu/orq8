import { Activity, ClipboardCheck } from "lucide-react";

// ORQ8 command-center welcome banner: greeting, divider, two status chips,
// and a live SYSTEM ONLINE panel on the right. Navy surface with lime and
// emerald accents per the ORQ8 design language.
export function WelcomeBanner() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="orq8-card mb-[25px] rounded-md bg-navy-950 p-[20px] text-white md:p-[25px]">
      <div className="orq8-card-content relative md:pr-[240px]">
        <div className="md:py-[5px]">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            {today}
          </p>
          <h5 className="!mb-[5px] mt-2 !font-semibold !text-white">
            Good morning, <span className="text-lime">Founder</span>
          </h5>
          <p className="text-[#d5d9e2]">
            Here&apos;s what&apos;s happening in your company today.
          </p>

          <div className="mb-[15px] mt-[15px] border-t border-white/10 md:mb-[30px] md:mt-[30px]"></div>

          <div className="sm:flex sm:items-center">
            <div className="flex items-center sm:mr-[20px] sm:mt-0 2xl:mr-[40px]">
              <div className="mr-[12px] flex h-[42px] w-[42px] items-center justify-center rounded-md bg-lime text-navy-950">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="mb-[1px] block text-[15px] font-semibold text-white md:mb-0 md:text-md">
                  2 Approvals waiting
                </span>
                <span className="block text-gray-200">Need your sign-off</span>
              </div>
            </div>

            <div className="mt-[15px] flex items-center sm:mt-0">
              <div className="mr-[12px] flex h-[42px] w-[42px] items-center justify-center rounded-md bg-emerald text-navy-950">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="mb-[1px] block text-[15px] font-semibold text-white md:mb-0 md:text-md">
                  3 Agents working
                </span>
                <span className="block text-gray-200">Across 2 departments</span>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative system status panel */}
        <div className="mt-[20px] rounded-md border border-white/10 bg-white/5 p-[16px] text-center md:absolute md:right-0 md:top-1/2 md:mt-0 md:w-[210px] md:-translate-y-1/2">
          <p className="flex items-center justify-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
            System online
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
            ORQ8
          </p>
          <p className="mt-1 text-xs text-white/60">Company of One</p>
        </div>
      </div>
    </div>
  );
}
