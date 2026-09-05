"use client";

import React from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Navigation } from "swiper/modules";

const testimonials = [
  {
    id: 1,
    quote:
      "I used to spend my evenings catching up on operations. Now my Executive Agent handles the routine — research, scheduling, content drafts. I review and approve. That's my whole job.",
    name: "Marcus Chen",
    position: "Founder & CEO, Meridian Labs",
    image: "/images/users/user1.jpg",
  },
  {
    id: 2,
    quote:
      "The approval gates give me real control. AI proposes, I decide. Everything is audited, every dollar tracked. It feels like having a real operations team without the overhead.",
    name: "Sarah Okonkwo",
    position: "Creative Director, Vantage Studio",
    image: "/images/users/user2.jpg",
  },
  {
    id: 3,
    quote:
      "I hired a research agent for a competitive analysis project. It completed in 48 hours what would've taken my team two weeks. The output was thorough and the costs were transparent.",
    name: "David Park",
    position: "Managing Partner, NexStep Ventures",
    image: "/images/users/user3.jpg",
  },
];

const users = [
  "/images/users/user1.jpg",
  "/images/users/user2.jpg",
  "/images/users/user3.jpg",
  "/images/users/user4.jpg",
];

const Testimonials: React.FC = () => {
  return (
    <div className="bg-gray-50">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        {/* Header — Trezo style */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orq8-orange mb-[10px] lg:mb-[15px]">
            Testimonials
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            Early users share their{" "}
            <span className="text-orq8-green">experience</span>
          </h2>
          <p className="text-gray-700 text-2sm mt-[12px] !mb-0">
            Demo profiles from our design process — real testimonials coming soon.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
          {/* Swiper carousel — Trezo style */}
          <div
            className="bg-gray-50 py-[25px] md:py-[50px] lg:py-[58.5px] xl:py-[125px] px-[20px] md:px-[30px] lg:px-[40px] xl:px-[60px] rounded-[10px] md:rounded-[20px] relative"
            id="orq8TestimonialsSlides"
          >
            <Swiper
              spaceBetween={25}
              slidesPerView={1}
              navigation={true}
              autoplay={{
                delay: 5000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }}
              modules={[Autoplay, Navigation]}
              className="partner-slides"
            >
              {testimonials.map((t) => (
                <SwiperSlide key={t.id}>
                  <Image
                    src="/images/icons/quote.svg"
                    className="mb-[15px] md:mb-[25px] xl:mb-[40px]"
                    alt="quote"
                    width={36}
                    height={27}
                  />
                  <p className="font-light text-md md:text-lg lg:text-xl xl:text-xl -tracking-[.44px] lg:-tracking-[1px] xl:-tracking-[1.44px] text-black !leading-[1.5]">
                    {t.quote}
                  </p>
                  <div className="flex items-center gap-[15px] mt-[20px] md:mt-[30px] xl:mt-[45px]">
                    <Image
                      src={t.image}
                      className="rounded-full w-[44px]"
                      alt={t.name}
                      width={44}
                      height={44}
                    />
                    <div>
                      <h3 className="!text-base md:!text-md !font-semibold !mb-[5px]">
                        {t.name}
                      </h3>
                      <span className="block text-gray-700 text-sm">
                        {t.position}
                      </span>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Visual panel — Trezo style with image + trust badge */}
          <div className="text-center relative rounded-[10px] md:rounded-[20px] overflow-hidden">
            <Image
              src="/images/testimonials.jpg"
              alt="testimonials"
              className="rounded-[20px] inline-block"
              width={939}
              height={939}
            />
            <div
              className="absolute ltr:left-[20px] rtl:right-[20px] bottom-[20px] md:max-w-[386px] uppercase text-xs font-bold tracking-[1.8px] rounded-[10px] md:rounded-[50px] border border-white p-[10px] bg-white/40 text-black text-center ltr:md:text-left rtl:md:text-right md:flex items-center gap-[10px] ltr:md:pr-[30px] rtl:md:pl-[30px]"
              style={{ backdropFilter: "blur(40px)" }}
            >
              <div className="flex items-center justify-center ltr:md:justify-left rtl:md:justify-right mb-[12px] md:mb-0">
                {users.map((user, index) => (
                  <Image
                    key={index}
                    src={user}
                    className="rounded-full w-[40px] border-[2px] border-white ltr:-mr-[15px] rtl:-ml-[15px] ltr:last:mr-0 rtl:last:ml-0"
                    alt="user-image"
                    width={40}
                    height={40}
                  />
                ))}
              </div>
              EARLY USERS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Testimonials;
