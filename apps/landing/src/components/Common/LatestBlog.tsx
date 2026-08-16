"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

interface BlogPost {
  id: number;
  imageUrl: string;
  date: string;
  readTime: string;
  title: string;
  slug: string;
}

const blogData: BlogPost[] = [
  {
    id: 1,
    imageUrl: "/images/blogs/blog1.jpg",
    date: "JAN 28, 2025",
    readTime: "5 MIN READ",
    title: "How to Take Full Control of Your Finances in 2025 Using ORQ8's Dashboard",
    slug: "/blog/details",
  },
  {
    id: 2,
    imageUrl: "/images/blogs/blog2.jpg",
    date: "JAN 31, 2025",
    readTime: "2 MIN READ",
    title: "10 Common Money Mistakes People Make (and How ORQ8 Helps You)",
    slug: "/blog/details",
  },
  {
    id: 3,
    imageUrl: "/images/blogs/blog3.jpg",
    date: "FEB 15, 2025",
    readTime: "3 MIN READ",
    title: "Why Traditional Budgeting Doesn't Work, and What ORQ8 Does Differently",
    slug: "/blog/details",
  },
];

const LatestBlog: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Articles
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              Read our latest <span className="text-primary-500">articles</span>{" "}
              to stay up-to-date
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[25px]">
            {blogData.map((post) => (
              <div key={post.id} className="group">
                <Link
                  href={post.slug}
                  className="block rounded-[10px] md:rounded-[20px] overflow-hidden"
                >
                  <Image
                    src={post.imageUrl}
                    className="rounded-[10px] md:rounded-[20px] inline-block transition-all group-hover:scale-110"
                    alt="blog-image"
                    width={615}
                    height={420}
                  />
                </Link>
                <ul className="mt-[20px] mb-[10px] md:mb-[15px] flex items-center gap-[15px]">
                  <li className="text-xs uppercase tracking-[1.2px] inline-block">
                    {post.date}
                  </li>
                  <li className="inline-block">
                    <div className="w-[5px] h-[5px] rounded-full bg-primary-500"></div>
                  </li>
                  <li className="text-xs uppercase tracking-[1.2px] inline-block">
                    {post.readTime}
                  </li>
                </ul>
                <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-0">
                  <Link
                    href={post.slug}
                    className="transition-all hover:text-primary-500"
                  >
                    {post.title}
                  </Link>
                </h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default LatestBlog;