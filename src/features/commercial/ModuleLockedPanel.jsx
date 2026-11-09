import { Lock } from "lucide-react";
import { Link } from "react-router";
import { formatModulePrice } from "./moduleProducts.js";

/** Polished locked-module screen — no sensitive data, clear unlock CTA. */
export function ModuleLockedPanel({
  title = "Module locked",
  body = "Purchase this module to unlock it for this business.",
  product = null,
  unlockPath = "/subscribe/modules",
}) {
  const price = product ? formatModulePrice(product) : null;
  return (
    <main className="ft-module-locked" role="region" aria-label={`${title} locked`}>
      <div className="ft-module-locked-card">
        <span className="ft-module-locked-icon" aria-hidden="true"><Lock size={28} strokeWidth={1.8} /></span>
        <p className="ft-kicker">Unlock module</p>
        <h1>{title}</h1>
        <p className="ft-module-locked-body">{body}</p>
        {product?.includes?.length ? (
          <ul className="ft-module-locked-includes">
            {product.includes.map(item => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
        {price ? (
          <p className="ft-module-locked-price">
            <strong>{price.label}</strong>
            <span> · {price.periodLabel}</span>
          </p>
        ) : null}
        <div className="ft-module-locked-actions">
          <Link className="btn primary" to={unlockPath}>Unlock</Link>
          <Link className="btn" to="/subscribe">Billing</Link>
        </div>
        <p className="small muted">Payment is verified on the server before this module opens. Your other modules and data stay as they are.</p>
      </div>
    </main>
  );
}
