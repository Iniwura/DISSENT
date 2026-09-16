import { QuickTestEvidenceDocument } from "@/components/dissent-v2/QuickTestEvidenceDocument";

export default function ReleaseReadyEvidencePage() {
  return (
    <QuickTestEvidenceDocument
      title="Release candidate readiness record"
      summary="A fictional release packet documenting accuracy, approval and a safety review before publication."
      sections={[
        { label: "Release record", body: "The reviewed artifact is versioned, its contents are identified, and the publication target is documented." },
        { label: "Accuracy check", body: "The packet records that the release candidate was compared with its source material and no unresolved factual discrepancy was found in this demonstration record." },
        { label: "Approval register", body: "The release owner and reviewer approval are recorded for this fictional packet." },
        { label: "Safety check", body: "The packet records that the intended release path was checked for material safety and authorization concerns." },
      ]}
    />
  );
}
