const SHOTS = {
  dashboard: {
    src: "/product/dashboard.png",
    alt: "FinTrack dashboard showing today’s collections, cashbook, and daily finance",
  },
  finance: {
    src: "/product/finance.png",
    alt: "Daily Finance screen with today’s collections",
  },
  monthly: {
    src: "/product/monthly.png",
    alt: "Monthly Finance screen with an interest account",
  },
  chit: {
    src: "/product/chit.png",
    alt: "Chit Fund screen with an auction scheme",
  },
  accounts: {
    src: "/product/accounts.png",
    alt: "Accounts transactions for a sample company, with posted sale, receipt, purchase, and payment vouchers",
  },
  intelligence: {
    src: "/product/intelligence.png",
    alt: "Ask FinTrack open on the dashboard, with suggested questions and a read-only answer",
  },
  portals: {
    src: "/product/portals.png",
    alt: "Sign-in screen with Financier sign in, Collection agent, Customer login, and Chit customer",
  },
  credit: {
    src: "/product/credit.png",
    alt: "FinTrack credit score for a daily account, with the gauge, band, and reasons from recorded payments",
  },
};

export function sceneForFeature(feature) {
  if (!feature) return "dashboard";
  if (feature.slug === "monthly-finance") return "monthly";
  if (feature.slug === "credit-score") return "credit";
  if (feature.category === "chit") return "chit";
  if (feature.category === "accounts") return "accounts";
  if (feature.category === "intelligence") return "intelligence";
  if (feature.category === "portals") return "portals";
  return "finance";
}

export function ProductPreview({ scene = "dashboard" }) {
  const shot = SHOTS[scene] || SHOTS.dashboard;
  return (
    <figure className="mkt-shot">
      <img src={shot.src} alt={shot.alt} />
    </figure>
  );
}
