import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignContacts, campaigns } from "@/db/schema";
import { getMetaConfig, sendTemplateMessage, type SendResult } from "@/lib/meta";

export const dynamic = "force-dynamic";

const FATAL_CAMPAIGN_ERRORS = new Set([
  "100",
  "190",
  "131005",
  "131042",
  "132001",
  "META_NOT_CONFIGURED",
]);

function demoResult(rowNumber: number): SendResult {
  if (rowNumber % 7 === 0) {
    return {
      status: "unavailable",
      messageId: null,
      errorCode: "DEMO_UNDELIVERABLE",
      errorDetail: "Demo result: recipient could not be reached on WhatsApp",
    };
  }
  return {
    status: rowNumber % 3 === 0 ? "sent" : "sent",
    messageId: `demo_${crypto.randomUUID()}`,
    errorCode: null,
    errorDetail: null,
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
    });
    if (!campaign) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }

    const pending = await db
      .select()
      .from(campaignContacts)
      .where(
        and(
          eq(campaignContacts.campaignId, id),
          eq(campaignContacts.validationStatus, "valid"),
          eq(campaignContacts.whatsappStatus, "not_checked"),
        ),
      )
      .orderBy(asc(campaignContacts.rowNumber))
      .limit(20);

    if (pending.length === 0) {
      await db.update(campaigns).set({
        status: "completed",
        updatedAt: new Date().toISOString(),
      }).where(eq(campaigns.id, id));
      return Response.json({ processed: 0, remaining: 0, results: [] });
    }

    await db.update(campaigns).set({
      status: "sending",
      updatedAt: new Date().toISOString(),
    }).where(eq(campaigns.id, id));

    const config = getMetaConfig();
    const results: Array<{ id: string; result: SendResult; processedAt: string }> = [];

    for (let offset = 0; offset < pending.length; offset += 5) {
      const group = pending.slice(offset, offset + 5);
      const groupResults = await Promise.all(
        group.map(async (contact) => {
          const result = config.live
            ? await sendTemplateMessage(contact.normalizedNumber ?? "")
            : demoResult(contact.rowNumber);
          return {
            contact,
            result,
            processedAt: new Date().toISOString(),
          };
        }),
      );

      for (const item of groupResults) {
        await db.update(campaignContacts).set({
          whatsappStatus: item.result.status,
          messageId: item.result.messageId,
          errorCode: item.result.errorCode,
          errorDetail: item.result.errorDetail,
          processedAt: item.processedAt,
        }).where(eq(campaignContacts.id, item.contact.id));
        results.push({
          id: item.contact.clientId,
          result: item.result,
          processedAt: item.processedAt,
        });
      }

      const fatal = groupResults.find((item) =>
        item.result.errorCode && FATAL_CAMPAIGN_ERRORS.has(item.result.errorCode)
      );
      if (fatal) {
        await db.update(campaigns).set({
          status: "paused",
          updatedAt: new Date().toISOString(),
        }).where(eq(campaigns.id, id));
        return Response.json(
          {
            error: `Campaign paused: ${fatal.result.errorDetail ?? "WhatsApp account or template configuration error"}`,
            processed: results.length,
            remaining: Math.max(0, campaign.validContacts - results.length),
            results,
          },
          { status: 409 },
        );
      }
    }

    const remainingRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaignContacts)
      .where(
        and(
          eq(campaignContacts.campaignId, id),
          eq(campaignContacts.validationStatus, "valid"),
          eq(campaignContacts.whatsappStatus, "not_checked"),
        ),
      );
    const remaining = Number(remainingRow[0]?.count ?? 0);
    if (remaining === 0) {
      await db.update(campaigns).set({
        status: "completed",
        updatedAt: new Date().toISOString(),
      }).where(eq(campaigns.id, id));
    }

    return Response.json({ processed: results.length, remaining, results });
  } catch (error) {
    console.error("campaign_send_failed", error);
    return Response.json(
      { error: "Sending stopped because of an unexpected error. No completed rows will be repeated." },
      { status: 500 },
    );
  }
}
