import { Link, useOutletContext } from "react-router";
import { marketingPaths } from "./paths.js";

export function ProductCta({ appPath = "/dashboard", primary = false, detail = false, label = "Start free" }) {
  const { signedIn = false } = useOutletContext() || {};
  const className = `mkt-btn${primary ? " primary" : ""}`;
  if (signedIn) return <Link className={className} to={appPath}>Open FinTrack</Link>;
  return <Link className={className} to={detail ? marketingPaths.login : marketingPaths.signup}>{detail ? "Login to use" : label}</Link>;
}
