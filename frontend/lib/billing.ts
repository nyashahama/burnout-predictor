const DEFAULT_PRO_PRICE = "R149";
const DEFAULT_PRO_PLAN = "Overload Pro";
const DEFAULT_REFERENCE = "OVR-YOUR-EMAIL";

function sanitizeReferencePart(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 18);
}

export function getEftReference(email?: string | null): string {
  if (!email) return DEFAULT_REFERENCE;

  const [localPart = "", domainPart = ""] = email.trim().split("@");
  const local = sanitizeReferencePart(localPart);
  const domain = sanitizeReferencePart(domainPart.split(".")[0] ?? "");
  const reference = [local, domain].filter(Boolean).join("-");

  return reference ? `OVR-${reference}`.slice(0, 24) : DEFAULT_REFERENCE;
}

export const billingConfig = {
  proPlanName: process.env.NEXT_PUBLIC_PRO_PLAN_NAME?.trim() || DEFAULT_PRO_PLAN,
  proPrice: process.env.NEXT_PUBLIC_PRO_PRICE?.trim() || DEFAULT_PRO_PRICE,
  accountName: process.env.NEXT_PUBLIC_EFT_ACCOUNT_NAME?.trim() || "",
  bankName: process.env.NEXT_PUBLIC_EFT_BANK_NAME?.trim() || "",
  accountNumber: process.env.NEXT_PUBLIC_EFT_ACCOUNT_NUMBER?.trim() || "",
  branchCode: process.env.NEXT_PUBLIC_EFT_BRANCH_CODE?.trim() || "",
  accountType: process.env.NEXT_PUBLIC_EFT_ACCOUNT_TYPE?.trim() || "",
  billingEmail: process.env.NEXT_PUBLIC_BILLING_EMAIL?.trim() || "",
  processingTime: process.env.NEXT_PUBLIC_EFT_PROCESSING_TIME?.trim() || "within 1 business day",
};

export const hasPublicEftDetails = Boolean(
  billingConfig.accountName &&
    billingConfig.bankName &&
    billingConfig.accountNumber &&
    billingConfig.billingEmail,
);
