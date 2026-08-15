import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variants = {
  default: "bg-navy-800 text-white hover:bg-navy-700",
  outline: "border border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white",
  ghost: "text-navy-800 hover:bg-navy-800/5",
  "outline-light": "border border-white/60 text-white hover:bg-white hover:text-navy-900",
  "ghost-light": "text-white/80 hover:text-white",
};

const sizes = {
  default: "h-10 px-5",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6",
};

type ButtonProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  href: string;
} & Omit<ComponentProps<typeof Link>, "href">;

export function Button({ variant = "default", size = "default", href, className, children, ...rest }: ButtonProps) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ""}`} {...rest}>
      {children}
    </Link>
  );
}
