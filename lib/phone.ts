import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { ContactResult } from "./campaign-types";

const DEFAULT_COUNTRY = "MY" as const;
const DEFAULT_CALLING_CODE = "60";

export function validatePhoneNumber(
  value: unknown,
  rowNumber: number,
  name = "",
): ContactResult {
  const originalNumber = String(value ?? "").trim();
  const base: ContactResult = {
    id: crypto.randomUUID(),
    rowNumber,
    name,
    originalNumber,
    normalizedNumber: null,
    countryCode: null,
    country: null,
    validationStatus: "invalid",
    validationDetail: "",
    whatsappStatus: "skipped",
    errorCode: null,
    errorDetail: null,
    messageId: null,
    processedAt: null,
  };

  if (!originalNumber) {
    return { ...base, validationDetail: "Phone number is empty" };
  }

  if (/[a-z]/i.test(originalNumber)) {
    const scientific = /^\d+(\.\d+)?e\+?\d+$/i.test(originalNumber);
    return {
      ...base,
      validationDetail: scientific
        ? "Excel converted this number to scientific notation; format the column as Text"
        : "Phone number contains letters",
    };
  }

  const compact = originalNumber.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) {
    return { ...base, validationDetail: "Phone number contains unsupported characters" };
  }

  let candidate = compact;
  let defaultCodeAdded = false;
  if (candidate.startsWith("00")) {
    candidate = `+${candidate.slice(2)}`;
  } else if (!candidate.startsWith("+")) {
    if (candidate.startsWith(DEFAULT_CALLING_CODE) && candidate.length >= 10) {
      candidate = `+${candidate}`;
    } else {
      defaultCodeAdded = true;
    }
  }

  const parsed = parsePhoneNumberFromString(candidate, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isPossible()) {
    return { ...base, validationDetail: "Invalid number length or country code" };
  }
  if (!parsed.isValid()) {
    return { ...base, validationDetail: "Number format is not valid for its country" };
  }

  return {
    ...base,
    normalizedNumber: parsed.number,
    countryCode: `+${parsed.countryCallingCode}`,
    country: parsed.country ?? "Unknown",
    validationStatus: "valid",
    validationDetail: defaultCodeAdded
      ? "Valid; Malaysia country code +60 added"
      : "Valid international number",
    whatsappStatus: "not_checked",
  };
}

export function markDuplicates(rows: ContactResult[]) {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.validationStatus !== "valid" || !row.normalizedNumber) return row;
    const firstRow = seen.get(row.normalizedNumber);
    if (firstRow) {
      return {
        ...row,
        validationStatus: "duplicate" as const,
        validationDetail: `Duplicate of Excel row ${firstRow}`,
        whatsappStatus: "skipped" as const,
      };
    }
    seen.set(row.normalizedNumber, row.rowNumber);
    return row;
  });
}
