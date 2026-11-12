/** App mark — ascending signal + AI neural spark. Decorative; parent supplies the name. */
export function BrandMark({ className = "", size }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <img
      className={`ft-brand-mark${className ? ` ${className}` : ""}`}
      src="/icons/fintrack-icon.svg"
      alt=""
      width={size || 32}
      height={size || 32}
      style={style}
      decoding="async"
      aria-hidden="true"
    />
  );
}

/** Mark + MyFinTracker wordmark (optional product suffix). */
export function BrandWordmark({ suffix = "", withMark = true, className = "", markSize }) {
  return (
    <span className={`ft-brand-lockup${className ? ` ${className}` : ""}`}>
      {withMark ? <BrandMark size={markSize} /> : null}
      <span className="ft-brand">
        <span className="ft-brand-strong">MyFin</span>Tracker
        {suffix ? <span className="ft-wordmark-suffix"> {suffix}</span> : null}
      </span>
    </span>
  );
}
