# Mayfair WhatsApp Campaigns

A private web dashboard for importing Excel contacts, validating international phone numbers, sending the approved Mayfair Car Parts template through the official WhatsApp Business Cloud API, and exporting a detailed Excel report.

## Included workflow

1. Upload an `.xlsx`, `.xls`, or `.csv` file.
2. Detect the phone-number column and optional contact-name column.
3. Normalize valid numbers to E.164 format. Malaysia (`+60`) is the default when a country code is missing.
4. Reject malformed, impossible, and duplicate numbers before sending.
5. Save the campaign and its contact rows in D1.
6. Submit valid contacts in batches of 20, with five concurrent WhatsApp requests and retries for temporary failures.
7. Save the immediate API acceptance or rejection for each number.
8. Download a workbook with `Results`, `Summary`, and `Errors` sheets.

The original uploaded workbook is read in the browser and is never modified.

## Excel format

The first sheet must contain one of these phone headers:

`phone`, `phone_number`, `mobile`, `mobile_number`, `number`, `whatsapp`, `whatsapp_number`, `contact`, or `contact_number`

An optional name column may be called `name`, `contact_name`, `workshop`, `business_name`, or `company`.

Format phone cells as **Text** in Excel to preserve `+` and leading zeroes.

## Development

### macOS quick start

See [ReadmeForMac.md](./ReadmeForMac.md) for complete MacBook installation instructions, or double-click `Start Mayfair WhatsApp.command` after cloning the repository and installing Node.js 22.

### Manual setup

```bash
npm install
npm run db:generate
npm run build
```

Apply the generated migration to the local preview database, then start the dashboard:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_busy_warstar.sql
npm run dev
```

## WhatsApp Business configuration

Copy `.env.example` to `.env.local` for local development and provide:

- `META_ACCESS_TOKEN`: a server-side system-user access token
- `META_PHONE_NUMBER_ID`: the sending phone number ID
- `META_TEMPLATE_NAME`: the exact approved template name
- `META_TEMPLATE_LANGUAGE`: the approved template language code
- `META_GRAPH_API_VERSION`: the Graph API version enabled for the Meta app
When the required outbound credentials are absent, the dashboard operates in visibly labelled demo mode and does not contact WhatsApp.

Webhook tracking is intentionally excluded from this version. A successful result means the WhatsApp API accepted the message request; it does not confirm final delivery or reading.

## Error handling

- File type, size, missing headers, empty sheets, and row limits are validated before import.
- Phone numbers are checked locally before any API request.
- Duplicate normalized numbers are skipped.
- Temporary API failures and rate limits are retried with exponential delay.
- Authentication, access, payment, and template configuration errors pause the campaign.
- Completed rows are stored so a retry does not resend them.
- Detailed local and WhatsApp errors are retained in the downloadable report.
# whatsapp_bot
