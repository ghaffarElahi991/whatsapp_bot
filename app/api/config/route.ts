import { getMetaConfig } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getMetaConfig();
  return Response.json({
    mode: config.live ? "live" : "demo",
    templateName: config.templateName || "mayfair_introduction",
    templateLanguage: config.templateLanguage,
    missing: config.missing,
    invalid: config.invalid,
  });
}
