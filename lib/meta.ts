import { env } from "cloudflare:workers";

type MetaErrorBody = {
  error?: {
    code?: number;
    message?: string;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export function getMetaConfig() {
  const config = {
    accessToken: env.META_ACCESS_TOKEN?.trim(),
    phoneNumberId: env.META_PHONE_NUMBER_ID?.trim(),
    templateName: env.META_TEMPLATE_NAME?.trim(),
    templateLanguage: env.META_TEMPLATE_LANGUAGE?.trim() || "en",
    graphApiVersion: env.META_GRAPH_API_VERSION?.trim(),
  };
  const missing = [
    !config.accessToken ? { key: "META_ACCESS_TOKEN", label: "Access token" } : null,
    !config.phoneNumberId ? { key: "META_PHONE_NUMBER_ID", label: "Phone Number ID" } : null,
    !config.templateName ? { key: "META_TEMPLATE_NAME", label: "Template name" } : null,
    !config.graphApiVersion ? { key: "META_GRAPH_API_VERSION", label: "Graph API version" } : null,
  ].filter((item): item is { key: string; label: string } => Boolean(item));
  const invalid = [
    config.phoneNumberId && !/^\d+$/.test(config.phoneNumberId)
      ? { key: "META_PHONE_NUMBER_ID", message: "Phone Number ID must contain digits only" }
      : null,
    config.graphApiVersion && !/^v\d+\.\d+$/.test(config.graphApiVersion)
      ? { key: "META_GRAPH_API_VERSION", message: "Graph API version must look like v24.0" }
      : null,
    config.templateName && !/^[a-z0-9_]+$/.test(config.templateName)
      ? { key: "META_TEMPLATE_NAME", message: "Template name must use lowercase letters, numbers, and underscores" }
      : null,
  ].filter((item): item is { key: string; message: string } => Boolean(item));
  const live = missing.length === 0 && invalid.length === 0;
  return { ...config, live, missing, invalid };
}

export type SendResult = {
  status: "sent" | "failed" | "unavailable";
  messageId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function sendTemplateMessage(to: string): Promise<SendResult> {
  const config = getMetaConfig();
  if (!config.live) {
    return {
      status: "failed",
      messageId: null,
      errorCode: "META_NOT_CONFIGURED",
      errorDetail: "WhatsApp Business API credentials are not configured",
    };
  }

  const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
  let lastError: SendResult = {
    status: "failed",
    messageId: null,
    errorCode: "META_REQUEST_FAILED",
    errorDetail: "WhatsApp request failed",
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json().catch(() => ({}))) as MetaErrorBody & {
        messages?: Array<{ id?: string }>;
      };

      if (response.ok && body.messages?.[0]?.id) {
        return {
          status: "sent",
          messageId: body.messages[0].id ?? null,
          errorCode: null,
          errorDetail: null,
        };
      }

      const code = body.error?.code?.toString() ?? `HTTP_${response.status}`;
      const detail = body.error?.message ?? "WhatsApp rejected the message";
      lastError = {
        status: code === "131026" ? "unavailable" : "failed",
        messageId: null,
        errorCode: code,
        errorDetail: detail,
      };

      if (response.status !== 429 && response.status < 500) return lastError;
    } catch (error) {
      lastError = {
        status: "failed",
        messageId: null,
        errorCode: error instanceof DOMException && error.name === "TimeoutError"
          ? "META_TIMEOUT"
          : "META_NETWORK_ERROR",
        errorDetail: error instanceof Error ? error.message : "WhatsApp request failed",
      };
    }

    if (attempt < 2) await wait(500 * 2 ** attempt);
  }

  return lastError;
}
