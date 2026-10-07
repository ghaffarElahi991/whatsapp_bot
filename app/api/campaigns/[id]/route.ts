import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignContacts, campaigns } from "@/db/schema";
import { toCampaignResponse } from "@/lib/campaign-dto";

export const dynamic = "force-dynamic";

export async function GET(
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
    const contacts = await db
      .select()
      .from(campaignContacts)
      .where(and(eq(campaignContacts.campaignId, id)))
      .orderBy(asc(campaignContacts.rowNumber));

    return Response.json(toCampaignResponse(campaign, contacts));
  } catch (error) {
    console.error("campaign_read_failed", error);
    return Response.json(
      { error: "Could not load the latest campaign results." },
      { status: 500 },
    );
  }
}
