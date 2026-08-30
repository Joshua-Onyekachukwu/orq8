"use client";

import React, { useEffect, useState } from "react";

const GoTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  // Toggle visibility based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll);

    // Cleanup
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Smooth scroll to top
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <>
      <button
        id="backToTopBtn"
        onClick={scrollToTop}
        className={`fixed bottom-[20px] right-[20px] lg:bottom-[30px] lg:right-[30px] xl:bottom-[40px] xl:right-[40px] z-[9] flex items-center justify-center w-[44px] h-[44px] bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-opacity duration-300 text-[20px] ${
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Go to top"
        type="button"
      >
        <i className="ri-arrow-up-line"></i>
      </button>
    </>
  );
};

export default GoTop;
