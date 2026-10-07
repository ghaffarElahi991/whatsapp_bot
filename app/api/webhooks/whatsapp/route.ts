import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignContacts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return Response.json({ error: "Webhook verification failed" }, { status: 403 });
}

function fromHex(value: string) {
  if (!/^[a-f\d]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifySignature(body: ArrayBuffer, signatureHeader: string | null) {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const signature = fromHex(signatureHeader.slice(7));
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, body);
}

type WebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

export async function POST(request: Request) {
  const body = await request.arrayBuffer();
  const valid = await verifySignature(body, request.headers.get("x-hub-signature-256"));
  if (!valid) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });

  try {
    const payload = JSON.parse(new TextDecoder().decode(body)) as {
      entry?: Array<{
        changes?: Array<{ value?: { statuses?: WebhookStatus[] } }>;
      }>;
    };
    const statuses = payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? []
    ) ?? [];
    const db = getDb();

    for (const update of statuses) {
      if (!update.id || !update.status) continue;
      const error = update.errors?.[0];
      const allowed = ["sent", "delivered", "read", "failed"];
      const status = update.status === "failed" && error?.code === 131026
        ? "unavailable"
        : allowed.includes(update.status)
          ? update.status
          : "failed";
      await db.update(campaignContacts).set({
        whatsappStatus: status,
        errorCode: error?.code?.toString() ?? null,
        errorDetail: error?.message ?? error?.title ?? null,
        processedAt: update.timestamp
          ? new Date(Number(update.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      }).where(eq(campaignContacts.messageId, update.id));
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("whatsapp_webhook_failed", error);
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
