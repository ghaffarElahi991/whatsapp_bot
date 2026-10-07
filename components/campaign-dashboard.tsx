"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  LoaderCircle,
  MessageCircleMore,
  Send,
  Upload,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import type { CampaignResponse, ContactResult } from "@/lib/campaign-types";
import { markDuplicates, validatePhoneNumber } from "@/lib/phone";

const TEMPLATE_TEXT = `Hi,

I wanted to introduce myself and Mayfair Car Parts. We’re based in KL, with a sourcing office in the UK, and help garages find parts that are difficult to get through their usual suppliers.

We focus on European and British cars, including Porsche, Rolls-Royce and Land Rover, and also help with parts for EVs. This includes discontinued parts, backorders and anything with a long lead time.

If you have a part you’re struggling to find, just send me the part number and I’ll check with our UK team. There’s no obligation to order.

We offer door-to-door delivery to Malaysia within 10 days, local after-sales support and a 12-month local warranty on all parts. For your first order, there’s no upfront payment. You only pay once the part arrives and you’ve checked and confirmed it.

You can find a little more about us here:
www.mayfaircarparts.com.my

It would be good to get to know your workshop and hopefully help when you need another sourcing option.

Regards,
Mayfair Car Parts Team, KL`;

const PHONE_HEADERS = new Set([
  "phone",
  "phonenumber",
  "mobile",
  "mobilenumber",
  "number",
  "whatsapp",
  "whatsappnumber",
  "contact",
  "contactnumber",
]);
const NAME_HEADERS = new Set(["name", "contactname", "workshop", "businessname", "company"]);

type AppMode = "loading" | "demo" | "live" | "offline";
type ConfigDiagnostics = {
  missing: Array<{ key: string; label: string }>;
  invalid: Array<{ key: string; message: string }>;
};
type ToolRegistration = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: ToolRegistration, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

function normaliseHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function readContacts(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  } catch {
    throw new Error("The file could not be read. Upload a valid Excel or CSV file.");
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The workbook does not contain a sheet.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[firstSheet],
    { defval: "", raw: false },
  );
  if (rows.length === 0) throw new Error("The first sheet does not contain any contact rows.");
  if (rows.length > 5000) throw new Error("A single campaign can contain up to 5,000 rows.");

  const headers = Object.keys(rows[0]);
  const phoneHeader = headers.find((header) => PHONE_HEADERS.has(normaliseHeader(header)));
  const nameHeader = headers.find((header) => NAME_HEADERS.has(normaliseHeader(header)));
  if (!phoneHeader) {
    throw new Error("No phone-number column was found. Use a header such as phone, mobile, or whatsapp_number.");
  }

  const contacts = rows.map((row, index) =>
    validatePhoneNumber(
      row[phoneHeader],
      index + 2,
      nameHeader ? String(row[nameHeader] ?? "").trim() : "",
    ),
  );
  return markDuplicates(contacts);
}

function statusLabel(status: ContactResult["whatsappStatus"]) {
  return {
    not_checked: "Not checked",
    queued: "Queued",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed",
    unavailable: "Unavailable",
    skipped: "Skipped",
  }[status];
}

function StatusBadge({ status }: { status: string }) {
  const positive = ["valid", "delivered", "read"];
  const neutral = ["sent", "queued", "not_checked"];
  const style = positive.includes(status)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : neutral.includes(status)
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : status === "failed" || status === "unavailable"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-800";
  const label = status === "not_checked"
    ? "Not checked"
    : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  return <Badge variant="outline" className={style}>{label}</Badge>;
}

function errorFromResponse(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

export function CampaignDashboard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [mode, setMode] = useState<AppMode>("loading");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [configDiagnostics, setConfigDiagnostics] = useState<ConfigDiagnostics>({ missing: [], invalid: [] });
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);

  const counts = useMemo(() => {
    const valid = contacts.filter((contact) => contact.validationStatus === "valid").length;
    const needsReview = contacts.length - valid;
    const submitted = contacts.filter((contact) => contact.whatsappStatus === "sent").length;
    return { imported: contacts.length, valid, needsReview, submitted };
  }, [contacts]);

  useEffect(() => {
    async function checkApi() {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok) throw new Error("The server configuration could not be read");
        const config = await response.json() as {
          mode: "demo" | "live";
          missing?: ConfigDiagnostics["missing"];
          invalid?: ConfigDiagnostics["invalid"];
        };
        setConfigDiagnostics({
          missing: config.missing ?? [],
          invalid: config.invalid ?? [],
        });
        if (config.mode === "demo") {
          setMode("demo");
          return;
        }

        const testResponse = await fetch("/api/config/test", { cache: "no-store" });
        const test = await testResponse.json().catch(() => ({})) as {
          connected?: boolean;
          displayPhoneNumber?: string | null;
          verifiedName?: string | null;
          error?: string;
          errorCode?: string;
        };
        if (!testResponse.ok || !test.connected) {
          const code = test.errorCode ? `[${test.errorCode}] ` : "";
          throw new Error(`${code}${test.error ?? "Meta rejected the API connection test"}`);
        }
        setConnectedNumber(
          [test.verifiedName, test.displayPhoneNumber].filter(Boolean).join(" · ") || "Connected number verified",
        );
        setLastError(null);
        setMode("live");
      } catch (error) {
        setMode("offline");
        setLastError(error instanceof Error ? error.message : "The WhatsApp API check failed");
      }
    }
    void checkApi();
  }, []);

  const applyImportedContacts = useCallback((nextContacts: ContactResult[], nextFileName: string) => {
    setContacts(nextContacts);
    setFileName(nextFileName);
    setCampaignId(null);
    setSendProgress(0);
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "validate_phone_numbers",
      title: "Validate phone numbers",
      description: "Validate and stage a list of international or Malaysian phone numbers in the visible Mayfair campaign table.",
      inputSchema: {
        type: "object",
        properties: {
          numbers: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5000 },
        },
        required: ["numbers"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        const numbers = input && typeof input === "object" && "numbers" in input
          ? (input as { numbers?: unknown }).numbers
          : null;
        if (!Array.isArray(numbers) || numbers.some((number) => typeof number !== "string")) {
          throw new Error("numbers must be an array of phone-number strings");
        }
        const results = markDuplicates(
          numbers.map((number, index) => validatePhoneNumber(number, index + 2)),
        );
        applyImportedContacts(results, "agent-contact-list.xlsx");
        return {
          imported: results.length,
          valid: results.filter((result) => result.validationStatus === "valid").length,
          invalid: results.filter((result) => result.validationStatus !== "valid").length,
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [applyImportedContacts]);

  async function handleFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      toast.error("Upload an .xlsx, .xls, or .csv file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("The file is larger than the 10 MB limit.");
      return;
    }
    setIsParsing(true);
    try {
      const nextContacts = await readContacts(file);
      applyImportedContacts(nextContacts, file.name);
      const valid = nextContacts.filter((contact) => contact.validationStatus === "valid").length;
      toast.success(`${nextContacts.length} rows imported; ${valid} are ready to send.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be imported.");
    } finally {
      setIsParsing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function refreshResults(id = campaignId) {
    if (!id) return contacts;
    const response = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorFromResponse(body, "Could not refresh campaign results."));
    const campaign = body as CampaignResponse;
    setContacts(campaign.contacts);
    return campaign.contacts;
  }

  async function sendCampaign() {
    if (!fileName || counts.valid === 0 || isSending) return;
    setIsSending(true);
    setSendProgress(2);
    setLastError(null);
    try {
      let activeCampaignId = campaignId;
      if (!activeCampaignId) {
        const createResponse = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, contacts }),
        });
        const createBody = await createResponse.json().catch(() => ({})) as {
          campaignId?: unknown;
          error?: unknown;
        };
        if (!createResponse.ok || typeof createBody.campaignId !== "string") {
          throw new Error(errorFromResponse(createBody, "Could not create the campaign."));
        }
        activeCampaignId = createBody.campaignId;
        setCampaignId(activeCampaignId);
      }

      let remaining = counts.valid;
      let processed = counts.valid - contacts.filter(
        (contact) => contact.validationStatus === "valid" && contact.whatsappStatus === "not_checked",
      ).length;

      do {
        const sendResponse = await fetch(`/api/campaigns/${activeCampaignId}/send`, { method: "POST" });
        const sendBody = await sendResponse.json().catch(() => ({})) as {
          processed?: unknown;
          remaining?: unknown;
          error?: unknown;
        };
        if (!sendResponse.ok) {
          await refreshResults(activeCampaignId).catch(() => undefined);
          throw new Error(errorFromResponse(sendBody, "Sending stopped unexpectedly."));
        }
        remaining = Number(sendBody.remaining ?? 0);
        processed += Number(sendBody.processed ?? 0);
        setSendProgress(Math.min(100, Math.round((processed / counts.valid) * 100)));
        await refreshResults(activeCampaignId);
      } while (remaining > 0);

      setSendProgress(100);
      toast.success(mode === "live"
        ? "Campaign submitted. Immediate WhatsApp API results were saved."
        : "Demo campaign completed. No WhatsApp messages were sent.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sending stopped unexpectedly.";
      setLastError(message);
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }

  async function downloadReport() {
    if (contacts.length === 0) return;
    try {
      const XLSX = await import("xlsx");
      const current = campaignId ? await refreshResults() : contacts;
      const reportRows = current.map((contact) => ({
        "Excel Row": contact.rowNumber,
        Name: contact.name,
        "Original Number": contact.originalNumber,
        "Normalized Number": contact.normalizedNumber ?? "",
        Country: contact.country ?? "",
        "Country Code": contact.countryCode ?? "",
        "Local Validation": contact.validationStatus,
        "Validation Detail": contact.validationDetail,
        "WhatsApp Status": statusLabel(contact.whatsappStatus),
        "Error Code": contact.errorCode ?? "",
        "Error Details": contact.errorDetail ?? "",
        "Message ID": contact.messageId ?? "",
        "Processed At": contact.processedAt ?? "",
      }));
      const errors = reportRows.filter((row) =>
        row["Local Validation"] !== "valid" || ["Failed", "Unavailable"].includes(row["WhatsApp Status"]),
      );
      const summary = [
        ["Campaign report", "Mayfair Car Parts"],
        ["Source file", fileName ?? ""],
        ["Mode", mode === "live" ? "Live" : "Demo"],
        ["Exported at", new Date().toISOString()],
        ["Imported", current.length],
        ["Valid", current.filter((row) => row.validationStatus === "valid").length],
        ["Invalid or duplicate", current.filter((row) => row.validationStatus !== "valid").length],
        ["Submitted to WhatsApp", current.filter((row) => row.whatsappStatus === "sent").length],
        ["Failed or unavailable", current.filter((row) => ["failed", "unavailable"].includes(row.whatsappStatus)).length],
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRows), "Results");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(errors), "Errors");
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `mayfair-whatsapp-results-${date}.xlsx`);
      toast.success("The latest Excel report was downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The report could not be created.");
    }
  }

  const metrics = [
    { value: counts.imported, label: "Imported", icon: FileSpreadsheet, colour: "text-slate-700" },
    { value: counts.valid, label: "Valid", icon: CheckCircle2, colour: "text-emerald-700" },
    { value: counts.needsReview, label: "Needs review", icon: CircleAlert, colour: "text-amber-700" },
    { value: counts.submitted, label: "Submitted", icon: Clock3, colour: "text-sky-700" },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="brand-mark" aria-hidden="true">M</div>
          <div className="mr-auto leading-tight">
            <p className="font-semibold tracking-[-0.02em]">Mayfair Car Parts</p>
            <p className="text-xs text-muted-foreground">WhatsApp campaigns</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm text-muted-foreground sm:flex">
            <span className={`size-2 rounded-full ${mode === "live" ? "bg-emerald-500" : mode === "demo" ? "bg-amber-500" : mode === "offline" ? "bg-red-500" : "bg-slate-400"}`} />
            {mode === "loading" ? "Checking API" : mode === "live" ? "WhatsApp API connected" : mode === "demo" ? "Demo mode" : "API check failed"}
          </div>
          <div className="flex size-9 items-center justify-center rounded-full bg-[#17231f] text-sm font-semibold text-white">MC</div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-border/80 px-4 py-6 lg:block">
          <nav className="space-y-1" aria-label="Main navigation">
            <a className="nav-item nav-item-active" href="#campaign"><LayoutDashboard />Campaign</a>
            <a className="nav-item" href="#contacts"><UsersRound />Contacts</a>
            <a className="nav-item" href="#message"><MessageCircleMore />Message</a>
            <a className="nav-item" href="#results"><FileSpreadsheet />Reports</a>
          </nav>
          <div className="mt-10 rounded-xl border border-emerald-900/10 bg-[#eef8f2] p-4">
            <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white"><CheckCircle2 className="size-4" /></div>
            <p className="text-sm font-semibold">Template approved</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Mayfair introduction · English</p>
          </div>
          {mode === "demo" && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              API setup is incomplete. The dashboard shows the missing settings in the main panel.
            </div>
          )}
        </aside>

        <section id="campaign" className="min-w-0 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">New campaign</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-[2.25rem]">Import, validate, send.</h1>
              <p className="mt-2 text-base text-muted-foreground">Upload your workshop list and review every number before messaging.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="bg-white" disabled={contacts.length === 0} onClick={() => void downloadReport()}>
                <Download />Download report
              </Button>
            </div>
          </div>

          {mode === "demo" && (
            <div className="mb-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">WhatsApp API is not configured on this Site</p>
                <p className="mt-1 text-sm leading-6">
                  Having these values in Meta does not automatically add them to the deployed dashboard. Add the following in Site Settings → Environment variables, then redeploy:
                </p>
                {configDiagnostics.missing.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {configDiagnostics.missing.map((item) => (
                      <code key={item.key} className="rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs">{item.key} · {item.label}</code>
                    ))}
                  </div>
                )}
                {configDiagnostics.invalid.map((item) => (
                  <p key={item.key} className="mt-2 text-sm"><code>{item.key}</code>: {item.message}</p>
                ))}
                <p className="mt-2 text-xs">For security, the access-token value is never returned to or printed in the browser.</p>
              </div>
            </div>
          )}

          {mode === "offline" && lastError && (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950" role="alert">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">WhatsApp API connection failed</p>
                <p className="mt-1 break-words text-sm leading-6">{lastError}</p>
                <p className="mt-1 text-xs">Check the token, Phone Number ID, API version, and Meta permissions.</p>
              </div>
            </div>
          )}

          {mode === "live" && connectedNumber && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="size-5 shrink-0" />
              <span><strong>Connection verified:</strong> {connectedNumber}</span>
            </div>
          )}

          {mode === "live" && lastError && (
            <div className="mb-5 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950" role="alert">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div><p className="font-semibold">Campaign error</p><p className="mt-1 break-words text-sm">{lastError}</p></div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.7fr)]">
            <Card className="overflow-hidden border-border/80 shadow-[0_12px_38px_rgba(20,38,31,.06)]">
              <CardHeader className="border-b bg-[#fbfdfc]">
                <div className="step-number">01</div>
                <CardTitle>Upload contact list</CardTitle>
                <CardDescription>Excel or CSV · phone numbers may include +60 or local format</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
                <button
                  type="button"
                  className={`upload-zone w-full ${isDragging ? "upload-zone-active" : ""}`}
                  onClick={() => fileInput.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setIsDragging(false); void handleFile(event.dataTransfer.files?.[0]); }}
                >
                  <span className="upload-icon">{isParsing ? <LoaderCircle className="animate-spin" /> : <Upload />}</span>
                  <span className="font-semibold">{isParsing ? "Reading contact list…" : "Choose an Excel file"}</span>
                  <span className="text-sm text-muted-foreground">or drag and drop it here</span>
                </button>
                {fileName ? (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/35 p-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><FileSpreadsheet className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-muted-foreground">{contacts.length} rows detected · default country Malaysia (+60)</p>
                    </div>
                    <CheckCircle2 className="size-5 text-emerald-600" />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Use a column named phone, mobile, number, or whatsapp_number. Format it as Text in Excel.</p>
                )}
              </CardContent>
            </Card>

            <Card id="message" className="border-[#1b332a] bg-[#17231f] text-white shadow-[0_18px_50px_rgba(12,31,24,.16)]">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="step-number step-number-dark">02</div>
                  <Badge className="bg-emerald-400/15 text-emerald-200">Approved</Badge>
                </div>
                <CardTitle className="text-white">Mayfair introduction</CardTitle>
                <CardDescription className="text-white/55">Marketing · English</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="message-preview">
                  <p>Hi,</p>
                  <p>I wanted to introduce myself and Mayfair Car Parts. We’re based in KL, with a sourcing office in the UK...</p>
                  <p className="font-medium text-[#8ce7b5]">www.mayfaircarparts.com.my</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5">
                      View full template <ChevronDown className="size-4" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Mayfair introduction</DialogTitle>
                      <DialogDescription>The approved message is sent exactly as shown.</DialogDescription>
                    </DialogHeader>
                    <div className="whitespace-pre-wrap rounded-xl border bg-muted/45 p-5 text-sm leading-6">{TEMPLATE_TEXT}</div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>

          {isSending && (
            <div className="mt-5 rounded-xl border bg-white p-4 shadow-sm" role="status" aria-live="polite">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Processing campaign</span>
                <span className="text-muted-foreground">{sendProgress}%</span>
              </div>
              <Progress value={sendProgress} />
            </div>
          )}

          <div id="contacts" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {metrics.map(({ value, label, icon: Icon, colour }) => (
              <div key={label} className="metric-card">
                <Icon className={`size-4 ${colour}`} />
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <Card id="results" className="mt-6 gap-0 overflow-hidden border-border/80 py-0 shadow-[0_12px_38px_rgba(20,38,31,.05)]">
            <CardHeader className="border-b py-5">
              <div>
                <CardTitle>Contact review</CardTitle>
                <CardDescription className="mt-1">Numbers are normalized before sending; the report records immediate API results.</CardDescription>
              </div>
              {campaignId && <Badge variant="outline" className="font-mono text-[11px]">Saved</Badge>}
            </CardHeader>
            {contacts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/35 hover:bg-muted/35">
                    <TableHead className="pl-6">Excel row</TableHead>
                    <TableHead>Original number</TableHead>
                    <TableHead>Normalized</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead>WhatsApp status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="pl-6 text-muted-foreground">{contact.rowNumber}</TableCell>
                      <TableCell className="font-medium">{contact.originalNumber || "—"}</TableCell>
                      <TableCell className="font-mono text-[13px]">{contact.normalizedNumber ?? "—"}</TableCell>
                      <TableCell>{contact.country ?? "—"}{contact.countryCode ? ` (${contact.countryCode})` : ""}</TableCell>
                      <TableCell><StatusBadge status={contact.validationStatus} /></TableCell>
                      <TableCell><StatusBadge status={contact.whatsappStatus} /></TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground" title={contact.errorDetail ?? contact.validationDetail}>
                        {contact.errorDetail ?? contact.validationDetail}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div>
                  <FileSpreadsheet className="mx-auto mb-3 size-7 text-muted-foreground/60" />
                  <p className="font-medium">No contacts imported yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Upload an Excel sheet to validate and review its numbers.</p>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 border-t bg-[#fbfdfc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {contacts.length === 0
                  ? "Nothing will be sent until a list is uploaded and confirmed."
                  : `${counts.needsReview} invalid or duplicate ${counts.needsReview === 1 ? "row" : "rows"} will be skipped and included in the report.`}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-[#0a7a4b] hover:bg-[#08663f]" disabled={counts.valid === 0 || isSending || mode === "offline" || mode === "loading"}>
                    {isSending ? <LoaderCircle className="animate-spin" /> : <Send />}
                    {mode === "demo" ? `Run demo for ${counts.valid} valid contacts` : `Send to ${counts.valid} valid contacts`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{mode === "live" ? "Send the WhatsApp campaign?" : "Run this campaign in demo mode?"}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {mode === "live"
                        ? `The approved Mayfair introduction template will be submitted to ${counts.valid} valid contacts. Invalid and duplicate rows will be skipped.`
                        : `This will generate realistic result records for ${counts.valid} valid contacts without contacting WhatsApp or sending messages.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void sendCampaign()}>{mode === "live" ? "Confirm and send" : "Run demo"}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
