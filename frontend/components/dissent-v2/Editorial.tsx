import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export function EditorialLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`dv2-label ${className}`.trim()}>{children}</p>;
}

export function SectionMarker({ number, label }: { number: string; label: string }) {
  return <div className="dv2-marker"><span>{number}</span><span>{label}</span></div>;
}

export function EditorialButton({ href, children, variant = "red", ...props }: { href: string; children: ReactNode; variant?: "red" | "light" } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link className={`dv2-button dv2-button-${variant}`.trim()} href={href} {...props}>{children}<ArrowUpRight size={15} aria-hidden="true" /></Link>;
}

export function EditorialAction({ children, variant = "red", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "red" | "light" }) {
  return <button className={`dv2-button dv2-button-${variant}`.trim()} type={props.type ?? "button"} {...props}>{children}<ArrowUpRight size={15} aria-hidden="true" /></button>;
}

export function GridFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`dv2-frame ${className}`.trim()}>{children}</div>;
}

export function MotionReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`dv2-reveal ${className}`.trim()}>{children}</div>;
}
