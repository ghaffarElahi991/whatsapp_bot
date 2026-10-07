import { getMetaConfig } from "@/lib/meta";

export const dynamic = "force-dynamic";

type MetaTestBody = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  error?: { code?: number; message?: string; error_subcode?: number };
};

export async function GET() {
  const config = getMetaConfig();
  if (!config.live) {
    return Response.json(
      {
        connected: false,
        error: "WhatsApp API settings are incomplete or invalid",
        missing: config.missing,
        invalid: config.invalid,
      },
      { status: 400 },
    );
  }

  try {
    const fields = "id,display_phone_number,verified_name,quality_rating";
    const response = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}?fields=${fields}`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );
    const body = await response.json().catch(() => ({})) as MetaTestBody;
    if (!response.ok) {
      return Response.json(
        {
          connected: false,
          error: body.error?.message ?? "Meta rejected the API connection test",
          errorCode: body.error?.code?.toString() ?? `HTTP_${response.status}`,
          errorSubcode: body.error?.error_subcode?.toString() ?? null,
        },
        { status: 502 },
      );
    }

    return Response.json({
      connected: true,
      phoneNumberId: body.id ?? config.phoneNumberId,
      displayPhoneNumber: body.display_phone_number ?? null,
      verifiedName: body.verified_name ?? null,
      qualityRating: body.quality_rating ?? null,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return Response.json(
      {
        connected: false,
        error: timedOut
          ? "Meta API connection test timed out"
          : error instanceof Error
            ? error.message
            : "Could not connect to the Meta API",
        errorCode: timedOut ? "META_TIMEOUT" : "META_NETWORK_ERROR",
      },
      { status: 502 },
    );
  }
}
