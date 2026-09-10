export function DissentMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mark" aria-label="Dissent">
      <span className="mark-glyph" aria-hidden="true"><i /><i /></span>
      {compact ? null : <span className="mark-word">DISSENT</span>}
    </div>
  );
}
