import Link from "next/link";

export type QuickTestEvidenceSection = {
  label: string;
  body: string;
};

export function QuickTestEvidenceDocument({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: QuickTestEvidenceSection[];
}) {
  return (
    <main className="dv2-evidence-document">
      <div className="dv2-evidence-document-frame">
        <Link className="dv2-back" href="/reviews/new">Back to create a review</Link>
        <p className="dv2-label">Dissent / fictional demonstration evidence</p>
        <h1>{title}</h1>
        <p className="dv2-evidence-document-summary">{summary}</p>
        <p className="dv2-evidence-document-notice">
          This page is a fictional demonstration document for testing a review workflow.
          It does not guarantee any validator outcome.
        </p>
        <div className="dv2-evidence-document-sections">
          {sections.map((section) => (
            <section key={section.label}>
              <p className="dv2-label">{section.label}</p>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
