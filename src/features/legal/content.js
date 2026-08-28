const updated = "28 August 2026";

export const LEGAL_PAGES = {
  privacy: {
    title: "Privacy Policy",
    updated,
    sections: [
      {
        heading: "Who we are",
        body: "FinTrack is a business workspace for financiers and chit fund operators. Each financier organization manages its own customer and member records.",
      },
      {
        heading: "Data we collect",
        body: "We store business account details, customer and chit member contact information, loan and chit payment records, optional KYC fields (Aadhaar and PAN stored encrypted server-side), collection notes, and portal login metadata. Financier accounts use Supabase Auth email and password.",
      },
      {
        heading: "How we use data",
        body: "Data is used only to operate lending and chit fund workflows for your organization: collections, statements, member portals, live bidding, and audit history. We do not sell customer data.",
      },
      {
        heading: "Security",
        body: "Financial writes go through secured database functions. Organization data is isolated with row-level security. Customer portal PINs are hashed. Refresh tokens for financier login are stored in HttpOnly cookies when deployed with FinTrack auth routes.",
      },
      {
        heading: "Retention and deletion",
        body: "Financiers control account closure and member removal. Some financial history may be retained for audit and dispute resolution even after an account is closed or a member is removed, as implemented in the application.",
      },
      {
        heading: "Your responsibilities",
        body: "Financiers must obtain lawful consent from customers and members, share portal PINs securely, and comply with applicable lending, chit fund, and data protection laws in India.",
      },
      {
        heading: "Contact",
        body: "For privacy requests, contact your financier organization first. Platform operators should publish a support email on their deployment.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated,
    sections: [
      {
        heading: "Service description",
        body: "FinTrack provides software for daily and monthly finance tracking, chit fund administration, collection workflows, and customer or member portals. The service is provided to business operators, not as a regulated financial institution.",
      },
      {
        heading: "Financier responsibilities",
        body: "You are responsible for the accuracy of records you enter, lawful collection practices, customer communications, and compliance with applicable regulations for your business model.",
      },
      {
        heading: "Customer and member portals",
        body: "Portal IDs and PINs must be kept confidential. FinTrack is not responsible for unauthorized access caused by shared PINs or device compromise.",
      },
      {
        heading: "Availability",
        body: "The service is provided on a best-effort basis. Planned maintenance and third-party outages may affect availability. Maintain your own backups of critical exports.",
      },
      {
        heading: "Prohibited use",
        body: "Do not use FinTrack for unlawful lending, unauthorized personal data processing, or attempts to bypass security controls.",
      },
      {
        heading: "Limitation of liability",
        body: "FinTrack is business software, not legal or accounting advice. Operators should verify calculations and seek professional advice for regulated activities.",
      },
      {
        heading: "Changes",
        body: "These terms may be updated as the product matures. Continued use after updates constitutes acceptance of the revised terms.",
      },
    ],
  },
};
