"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "./Sidebar";

const ServiceDetailsContent: React.FC = () => {
  return (
    <>
      <div className="pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[25px]">
            <div>
              <Sidebar />
            </div>

            <div className="lg:col-span-2">
              <h2 className="!mb-[25px] lg:!mb-[30px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
                Multi-Account Aggregation
              </h2>

              <Image
                src="/images/services/service-details.jpg"
                className="inline-block rounded-[10px] md:rounded-[20px] mb-[25px] md:mb-[30px]"
                alt="service-details-image"
                width={1284}
                height={846}
              />

              <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                ORQ8’s Multi-Account Aggregation service allows users to
                connect all of their financial accounts—bank accounts, credit
                cards, digital wallets, loans, and even investment
                platforms—into a single, unified dashboard. This means you no
                longer have to jump between apps or websites to understand your
                financial picture.
              </p>

              <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[20px] [&:not(:first-child)]:mt-[25px] [&:not(:first-child)]:md:mt-[35px] [&:not(:first-child)]:lg:mt-[50px]">
                Why It Matters?
              </h3>

              <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                Managing finances across multiple platforms can be overwhelming.
                With ORQ8, you get a real-time, 360-degree view of your money,
                no matter where it’s held. This centralized access helps you
                make smarter financial decisions, reduce financial anxiety, and
                stay on top of every dollar.
              </p>

              <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[20px] [&:not(:first-child)]:mt-[25px] [&:not(:first-child)]:md:mt-[35px] [&:not(:first-child)]:lg:mt-[50px]">
                Key Features and Benefits
              </h3>

              <ul className="mt-[25px] md:mt-[30px]">
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    1. One Dashboard, All Your Accounts:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    View your total balance, cash flow, debts, and savings in
                    one place—updated in real-time.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    2. Support for Hundreds of Institutions:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    Seamlessly connect to major banks, neobanks, credit unions,
                    payment platforms (like PayPal or Wise), and investment
                    services.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    3. Read-Only Secure Connections:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    ORQ8 connects to your accounts through bank-level
                    encryption and read-only access, meaning we can view your
                    data—but never touch your money.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    4. Automatic Syncing:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    No manual entry needed. Your balances and transactions are
                    automatically updated so you&apos;re always working with the most
                    current data.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    5. Customizable Views:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    Group accounts by purpose (e.g., Personal, Business,
                    Savings) or type, and filter by currency or region for added
                    clarity.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    6. Multi-Currency Support:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    ORQ8 automatically converts foreign balances into your
                    primary currency using live exchange rates—great for digital
                    nomads and global users.
                  </p>
                </li>
                <li className="mb-[20px] md:mb-[25px] last:mb-0">
                  <h5 className="!font-medium !text-base md:!text-[15px] lg:!text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[10px] md:!mb-[12px]">
                    7. Cross-Platform Access:
                  </h5>
                  <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                    Access your complete financial snapshot from desktop or
                    mobile with a seamless experience across devices.
                  </p>
                </li>
              </ul>

              <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[20px] [&:not(:first-child)]:mt-[25px] [&:not(:first-child)]:md:mt-[35px] [&:not(:first-child)]:lg:mt-[50px]">
                Use Cases
              </h3>

              <ol className="mb-[25px] md:mb-[35px] lg:mb-[50px] list-decimal list-inside">
                <li className="md:text-[15px] lg:text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[12px] last:mb-0">
                  <span className="text-black dark:text-white font-medium">
                    Individuals:
                  </span>{" "}
                  Track checking, savings, credit cards, and retirement funds in
                  one place.
                </li>
                <li className="md:text-[15px] lg:text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[12px] last:mb-0">
                  <span className="text-black dark:text-white font-medium">
                    Freelancers:
                  </span>{" "}
                  Combine personal and business accounts while keeping them
                  organized.
                </li>
                <li className="md:text-[15px] lg:text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[12px] last:mb-0">
                  <span className="text-black dark:text-white font-medium">
                    Families & Couples:
                  </span>{" "}
                  Monitor shared expenses and joint accounts alongside
                  individual ones.
                </li>
                <li className="md:text-[15px] lg:text-md -tracking-[0.16px] md:-tracking-[0.50px] lg:-tracking-[0.96px] mb-[12px] last:mb-0">
                  <span className="text-black dark:text-white font-medium">
                    Travelers/Expats:
                  </span>{" "}
                  Keep track of foreign accounts and view everything in your
                  home currency.
                </li>
              </ol>

              <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                ORQ8’s Multi-Account Aggregation feature brings all your
                financial accounts—banking, credit cards, wallets, and
                investments—into one unified dashboard. Track your total
                balance, cash flow, and spending in real time without switching
                between apps. Enjoy secure, read-only access with bank-level
                encryption for complete peace of mind. Automatic syncing ensures
                your data is always up to date and organized.
              </p>

              <Link
                href="/#waitlist"
                className="inline-block rounded-[60px] bg-orange-400 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] transition-all hover:bg-[#c8ff32] hover:text-black mt-[10px] md:mt-[25px]"
              >
                <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                  JOIN THE WAITLIST{" "}
                  <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ServiceDetailsContent;
