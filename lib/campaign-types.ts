export type ValidationStatus = "valid" | "invalid" | "duplicate";
export type WhatsAppStatus =
  | "not_checked"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unavailable"
  | "skipped";

export interface ContactResult {
  id: string;
  rowNumber: number;
  name: string;
  originalNumber: string;
  normalizedNumber: string | null;
  countryCode: string | null;
  country: string | null;
  validationStatus: ValidationStatus;
  validationDetail: string;
  whatsappStatus: WhatsAppStatus;
  errorCode: string | null;
  errorDetail: string | null;
  messageId: string | null;
  processedAt: string | null;
}

export interface CampaignResponse {
  campaign: {
    id: string;
    fileName: string;
    status: string;
    mode: "demo" | "live";
    templateName: string;
    templateLanguage: string;
    totalContacts: number;
    validContacts: number;
    createdAt: string;
    updatedAt: string;
  };
  contacts: ContactResult[];
}
