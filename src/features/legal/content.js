const updated = "12 November 2026";

export const LEGAL_PAGES = {
  privacy: {
    title: "Privacy Policy",
    updated,
    sections: [
      {
        heading: "Who we are",
        body: "MyFinTracker is a business workspace for accounting, Counter POS billing, collections, and chit funds. Each organisation manages its own company books, customers, and members.",
      },
      {
        heading: "Data we collect",
        body: "We store business account details, company books, inventory, POS bills, expense attachments, workspace backups, customer and chit member contact information, loan and chit payment records, optional KYC fields (Aadhaar and PAN stored encrypted server-side), collection notes, and portal login metadata. Owner accounts use email and password. Collection agents, finance customers, and chit members use an ID and PIN.",
      },
      {
        heading: "How we use data",
        body: "Data is used only to operate your organisation’s workspace: accounting, Counter billing, collections, statements, member portals, live bidding, and audit history. AI suggestions read records in the company you have open. Offline till bills stay on that device until they sync. We do not sell customer data.",
      },
      {
        heading: "Security",
        body: "Financial writes go through secured database functions. Organization data is isolated with row-level security. Customer, chit member, and collection agent PINs are hashed. Refresh tokens for financier and agent login are stored in HttpOnly cookies when deployed with MyFinTracker auth routes.",
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
        body: "MyFinTracker provides software for company accounts and Counter POS billing, daily and monthly finance tracking, chit fund administration, collection workflows, and customer or member portals. The service is provided to business operators, not as a regulated financial institution.",
      },
      {
        heading: "Financier responsibilities",
        body: "You are responsible for the accuracy of records you enter, lawful collection practices, customer communications, and compliance with applicable regulations for your business model.",
      },
      {
        heading: "Customer and member portals",
        body: "Portal IDs and PINs must be kept confidential. MyFinTracker is not responsible for unauthorized access caused by shared PINs or device compromise.",
      },
      {
        heading: "Availability",
        body: "The service is provided on a best-effort basis. Planned maintenance and third-party outages may affect availability. Counter can take cash and UPI bills on this device for up to 48 hours without internet; those bills post when the device is back online. Maintain your own backups of critical exports.",
      },
      {
        heading: "Prohibited use",
        body: "Do not use MyFinTracker for unlawful lending, unauthorized personal data processing, or attempts to bypass security controls.",
      },
      {
        heading: "Limitation of liability",
        body: "MyFinTracker is business software, not legal or accounting advice. Operators should verify calculations and seek professional advice for regulated activities.",
      },
      {
        heading: "Changes",
        body: "These terms may be updated as the product matures. Continued use after updates constitutes acceptance of the revised terms.",
      },
    ],
  },
};
