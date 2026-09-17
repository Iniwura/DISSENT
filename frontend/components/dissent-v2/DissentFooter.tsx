import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { VERIFIED_X_POST_URL } from "@/lib/dissent/config";
import { EditorialLabel } from "./Editorial";

export function DissentFooter() {
  return <footer className="dv2-footer"><div className="dv2-footer-top"><div><EditorialLabel>Open protocol / settled internal credit</EditorialLabel><p className="dv2-footer-word">DISSENT<span>.</span></p></div><div className="dv2-footer-links"><Link href="/reviews">Reviews <ArrowUpRight size={14} /></Link><Link href="/reviews/new">Start a Review <ArrowUpRight size={14} /></Link><Link href="/profile">Profile <ArrowUpRight size={14} /></Link><a href={VERIFIED_X_POST_URL} target="_blank" rel="noopener noreferrer">Original source on X <ArrowUpRight size={14} /></a></div></div><div className="dv2-footer-bottom"><span>STUDIO NEXT / CHAIN 61997</span><span>PUBLIC RECORDS, EXPLICIT ACTIONS</span><span>  DISSENT</span></div></footer>;
}
