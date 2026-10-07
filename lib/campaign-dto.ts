import type { CampaignResponse, ContactResult } from "./campaign-types";

type CampaignRow = {
  id: string;
  fileName: string;
  status: string;
  mode: string;
  templateName: string;
  templateLanguage: string;
  totalContacts: number;
  validContacts: number;
  createdAt: string;
  updatedAt: string;
};

type ContactRow = {
  clientId: string;
  rowNumber: number;
  name: string;
  originalNumber: string;
  normalizedNumber: string | null;
  countryCode: string | null;
  country: string | null;
  validationStatus: string;
  validationDetail: string;
  whatsappStatus: string;
  errorCode: string | null;
  errorDetail: string | null;
  messageId: string | null;
  processedAt: string | null;
};

export function toCampaignResponse(
  campaign: CampaignRow,
  contacts: ContactRow[],
): CampaignResponse {
  return {
    campaign: {
      ...campaign,
      mode: campaign.mode === "live" ? "live" : "demo",
    },
    contacts: contacts.map((contact) => ({
      id: contact.clientId,
      rowNumber: contact.rowNumber,
      name: contact.name,
      originalNumber: contact.originalNumber,
      normalizedNumber: contact.normalizedNumber,
      countryCode: contact.countryCode,
      country: contact.country,
      validationStatus: contact.validationStatus as ContactResult["validationStatus"],
      validationDetail: contact.validationDetail,
      whatsappStatus: contact.whatsappStatus as ContactResult["whatsappStatus"],
      errorCode: contact.errorCode,
      errorDetail: contact.errorDetail,
      messageId: contact.messageId,
      processedAt: contact.processedAt,
    })),
  };
}
