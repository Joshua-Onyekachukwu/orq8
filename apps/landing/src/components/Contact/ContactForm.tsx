"use client";

import React from "react";
import ContactInfo from "./ContactInfo";

const ContactForm: React.FC = () => {
  return (
    <>
      <div className="pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px] items-center">
            <div className="ltr:xl:pr-[25px] rtl:xl:pl-[25px]">
              <ContactInfo />
            </div>

            <div>
              <div className="bg-[#f4f4f4] dark:bg-[#0a0e19] rounded-[10px] md:rounded-[20px] p-[25px] md:p-[35px] lg:p-[45px]">
                <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[20px] md:!mb-[25px] lg:!mb-[35px]">
                  Send us a message
                </h3>

                <form>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-[20px] md:gap-[25px]">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="block uppercase font-medium text-xs tracking-[1.8px] mb-[10px]"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="contact-name"
                        name="name"
                        autoComplete="name"
                        required
                        className="block text-sm md:text-base w-full h-[50px] bg-white dark:bg-dark rounded-[50px] px-[15px] md:px-[20px] outline-0 text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        placeholder="Enter name"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block uppercase font-medium text-xs tracking-[1.8px] mb-[10px]"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="contact-email"
                        name="email"
                        autoComplete="email"
                        required
                        className="block text-sm md:text-base w-full h-[50px] bg-white dark:bg-dark rounded-[50px] px-[15px] md:px-[20px] outline-0 text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        placeholder="Enter email address"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="contact-phone"
                        className="block uppercase font-medium text-xs tracking-[1.8px] mb-[10px]"
                      >
                        Phone no
                      </label>
                      <input
                        type="tel"
                        id="contact-phone"
                        name="phone"
                        autoComplete="tel"
                        className="block text-sm md:text-base w-full h-[50px] bg-white dark:bg-dark rounded-[50px] px-[15px] md:px-[20px] outline-0 text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        placeholder="Enter phone number"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="contact-message"
                        className="block uppercase font-medium text-xs tracking-[1.8px] mb-[10px]"
                      >
                        Message
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        required
                        className="block text-sm md:text-base w-full h-[164px] bg-white dark:bg-dark rounded-[20px] px-[15px] md:px-[20px] pt-[15px] md:pt-[20px] outline-0 text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        placeholder="Write your message here"
                      ></textarea>
                    </div>

                    <div className="form-check md:col-span-2">
                      <input
                        type="checkbox"
                        className="cursor-pointer top-[2px] ltr:mr-[5px] rtl:ml-[5px]"
                        id="termsConditions"
                      />
                      <label
                        htmlFor="termsConditions"
                        className="cursor-pointer inline-block"
                      >
                        I agree that my submitted data is being collected and
                        stored.
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        className="inline-block rounded-[60px] bg-primary-500 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] transition-all hover:bg-[#c8ff32] hover:text-black"
                      >
                        <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                          Submit Message{" "}
                          <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                        </span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ContactForm;
