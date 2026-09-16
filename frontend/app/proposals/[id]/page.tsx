import { redirect } from "next/navigation";

export default async function ProposalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/reviews/${encodeURIComponent(decodeURIComponent(id))}`);
}
