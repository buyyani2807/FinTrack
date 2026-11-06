/**
 * FinTrackit wordmark: FIN + Track + aⁱ (AI ligature) + t.
 * Large italic a on the baseline with a small superscript i — same line as the wordmark.
 */
export function BrandWordmark({
  suffix = "",
  className = "",
  as: Tag = "span",
  ...props
}) {
  const label = `FinTrackit${suffix ? ` ${suffix}` : ""}`;
  return (
    <Tag className={`ft-brand${className ? ` ${className}` : ""}`} aria-label={label} {...props}>
      <span className="ft-brand-strong" aria-hidden="true">FIN</span>
      <span className="ft-brand-track" aria-hidden="true">Track</span>
      <span className="ft-brand-ai" aria-hidden="true" title="AI">
        <span className="ft-brand-ai-a">a</span>
        <span className="ft-brand-ai-i">i</span>
      </span>
      <span className="ft-brand-end" aria-hidden="true">t</span>
      {suffix ? <span className="ft-wordmark-suffix"> {suffix}</span> : null}
    </Tag>
  );
}
