import { QuickTestEvidenceDocument } from "@/components/dissent-v2/QuickTestEvidenceDocument";

export default function UnsafeReleaseEvidencePage() {
  return (
    <QuickTestEvidenceDocument
      title="Release candidate risk record"
      summary="A fictional release packet documenting an unresolved safety or authorization concern."
      sections={[
        { label: "Release record", body: "The reviewed artifact and its intended publication target are documented for this demonstration." },
        { label: "Unresolved risk", body: "The packet records a material safety and authorization concern that remains unresolved in the release candidate." },
        { label: "Approval register", body: "The release owner has not recorded approval while the material concern remains open." },
        { label: "Required action", body: "The packet requires the risk owner to resolve and document the concern before publication." },
      ]}
    />
  );
}
