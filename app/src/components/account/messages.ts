import type { BrowserApiError } from "@/lib/api/browser";

/** Where an account error should be shown. `reauth` means a fresh sign in is needed first. */
export type ErrorField =
  "current" | "new" | "password" | "confirmation" | "firstName" | "reauth" | "form";

export interface FieldMessage {
  field: ErrorField;
  message: string;
}

const PASSWORD_RULES: Record<string, string> = {
  too_short: "Use at least 10 characters.",
  too_long: "Use 128 characters or fewer.",
  same_as_email: "Choose a password that is different from your email.",
  too_common: "That password is too common. Try a longer one that is harder to guess.",
};

interface Detail {
  field: string;
  type: string;
}

function readDetails(details: unknown): Detail[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { field, type } = item as Record<string, unknown>;
    return typeof field === "string" && typeof type === "string" ? [{ field, type }] : [];
  });
}

function validationMessage(details: Detail[]): FieldMessage | null {
  for (const detail of details) {
    if (detail.field === "new_password") {
      return {
        field: "new",
        message: PASSWORD_RULES[detail.type] ?? "Choose a different password.",
      };
    }
    if (detail.field === "first_name") {
      return { field: "firstName", message: "Enter your first name." };
    }
    if (detail.field === "confirmation") {
      return { field: "confirmation", message: "Type DELETE in capital letters to continue." };
    }
    if (detail.field === "current_password" || detail.field === "password") {
      return {
        field: detail.field === "password" ? "password" : "current",
        message: "Enter your password.",
      };
    }
  }
  return null;
}

/**
 * Turns an API error into one friendly message and the field it belongs to. The second argument
 * says which field a password_incorrect error should land on in the current form.
 */
export function describeAccountError(
  error: BrowserApiError,
  wrongPasswordField: "current" | "password" | "firstName" | "form",
): FieldMessage {
  switch (error.code) {
    case "password_incorrect":
      return {
        field: wrongPasswordField === "password" ? "password" : "current",
        message: "That password is not correct. Check it and try again.",
      };
    case "reauth_required":
      return { field: "reauth", message: error.message };
    case "rate_limited": {
      const wait = error.retryAfterSeconds;
      return {
        field: "form",
        message:
          wait !== undefined
            ? `Too many attempts. Try again in ${wait} seconds.`
            : "Too many attempts. Wait a moment and try again.",
      };
    }
    case "validation_error":
      return (
        validationMessage(readDetails(error.details)) ?? { field: "form", message: error.message }
      );
    default:
      return { field: "form", message: error.message };
  }
}
