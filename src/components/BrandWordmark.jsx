/**
 * FinTrackit wordmark: FIN + Track + stacked a/i (AI) + t.
 * The lowercase a sits on the i stem so the mark reads as AI.
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
        <span className="ft-brand-ai-i">ı</span>
      </span>
      <span className="ft-brand-end" aria-hidden="true">t</span>
      {suffix ? <span className="ft-wordmark-suffix"> {suffix}</span> : null}
    </Tag>
  );
}
