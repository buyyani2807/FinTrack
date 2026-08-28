import { LEGAL_PAGES } from "./content.js";

export function LegalPage({ view, backLabel = "Back to sign in" }) {
  const page = LEGAL_PAGES[view];
  if (!page) return null;
  const goBack = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url.pathname + url.search);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <main className="shell" style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <button type="button" className="link-button" onClick={goBack}>{backLabel}</button>
      <h1 className="title spacer">{page.title}</h1>
      <p className="copy small">Last updated: {page.updated}</p>
      {page.sections.map(section => (
        <section key={section.heading} className="card spacer">
          <strong>{section.heading}</strong>
          <p className="copy small spacer">{section.body}</p>
        </section>
      ))}
    </main>
  );
}

export function legalViewFromLocation() {
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "privacy" || view === "terms" ? view : null;
}

export function openLegalView(view) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.pushState({}, "", url.pathname + url.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
