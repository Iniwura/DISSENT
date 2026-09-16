import { QuickTestEvidenceDocument } from "@/components/dissent-v2/QuickTestEvidenceDocument";

export default function CorrectionNeededEvidencePage() {
  return (
    <QuickTestEvidenceDocument
      title="Release candidate correction record"
      summary="A fictional release packet documenting a material issue that needs correction before publication."
      sections={[
        { label: "Release record", body: "The reviewed artifact is versioned and the intended publication target is documented." },
        { label: "Material issue", body: "The packet records a factual discrepancy in the release candidate that must be corrected against the source record." },
        { label: "Approval register", body: "Final approval is held pending confirmation that the recorded discrepancy has been corrected." },
        { label: "Release condition", body: "The release owner has documented the correction step and the evidence required to close it." },
      ]}
    />
  );
}
