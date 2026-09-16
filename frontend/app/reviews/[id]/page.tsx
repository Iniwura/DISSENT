import { DissentShell } from "@/components/dissent-v2/DissentShell";
import { ReviewDossierV2 } from "@/components/dissent-v2/ReviewDossierV2";

export default async function ReviewRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DissentShell><ReviewDossierV2 proposalId={decodeURIComponent(id)} /></DissentShell>;
}
