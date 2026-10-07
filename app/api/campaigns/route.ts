import { getDb } from "@/db";
import { campaignContacts, campaigns } from "@/db/schema";
import { getMetaConfig } from "@/lib/meta";
import { z } from "zod";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  id: z.string().min(1).max(100),
  rowNumber: z.number().int().positive(),
  name: z.string().max(200),
  originalNumber: z.string().max(100),
  normalizedNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable(),
  countryCode: z.string().max(8).nullable(),
  country: z.string().max(10).nullable(),
  validationStatus: z.enum(["valid", "invalid", "duplicate"]),
  validationDetail: z.string().max(500),
  whatsappStatus: z.enum(["not_checked", "skipped"]),
});

const campaignSchema = z.object({
  fileName: z.string().min(1).max(255),
  contacts: z.array(contactSchema).min(1).max(5000),
});

export async function POST(request: Request) {
  try {
    const parsed = campaignSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "The uploaded contact data is invalid", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const config = getMetaConfig();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validContacts = parsed.data.contacts.filter(
      (contact) => contact.validationStatus === "valid",
    ).length;
    const db = getDb();

    await db.insert(campaigns).values({
      id,
      fileName: parsed.data.fileName,
      status: "ready",
      mode: config.live ? "live" : "demo",
      templateName: config.templateName || "mayfair_introduction",
      templateLanguage: config.templateLanguage,
      totalContacts: parsed.data.contacts.length,
      validContacts,
      createdAt: now,
      updatedAt: now,
    });

    // Keep each statement below D1's bound-parameter ceiling.
    for (let offset = 0; offset < parsed.data.contacts.length; offset += 6) {
      const chunk = parsed.data.contacts.slice(offset, offset + 6);
      await db.insert(campaignContacts).values(
        chunk.map((contact) => ({
          clientId: contact.id,
          campaignId: id,
          rowNumber: contact.rowNumber,
          name: contact.name,
          originalNumber: contact.originalNumber,
          normalizedNumber: contact.normalizedNumber,
          countryCode: contact.countryCode,
          country: contact.country,
          validationStatus: contact.validationStatus,
          validationDetail: contact.validationDetail,
          whatsappStatus: contact.validationStatus === "valid"
            ? "not_checked"
            : "skipped",
        })),
      );
    }

    return Response.json(
      {
        campaignId: id,
        mode: config.live ? "live" : "demo",
        validContacts,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("campaign_create_failed", error);
    return Response.json(
      { error: "Could not save the campaign. Please try again." },
      { status: 500 },
    );
  }
}
