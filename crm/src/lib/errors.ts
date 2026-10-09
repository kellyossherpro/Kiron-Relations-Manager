// Errors carry messages written for the person using the CRM, not for developers.
export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends Error {
  constructor(message = "That record doesn't exist or has been deleted.") {
    super(message);
  }
}

export class RuleError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

type PgError = { code?: string; constraint?: string };

const FRIENDLY: Record<string, { message: string; field?: string }> = {
  companies_name_unique: { message: "A company with this legal entity name already exists.", field: "name" },
  contacts_email_unique: { message: "A contact with this email address already exists.", field: "email" },
  users_email_unique: { message: "Someone with this email address already has access." },
  property_definitions_key_unique: { message: "A field with this name already exists." },
  teams_name_unique: { message: "A department or group with this name already exists." },
  companies_website_required_online: { message: "Online companies need a website. Retail companies can leave it empty.", field: "website" },
  addendums_one_open: { message: "This deal already has an addendum in progress. Finish or cancel it first." },
  contacts_email_or_phone: { message: "Add an email address or a phone number.", field: "email" },
};

// Turns database constraint errors into RuleErrors; rethrows anything else.
export function translateDbError(e: unknown): never {
  // Drizzle wraps the driver's error; the Postgres details are on `cause`.
  const err = ((e as { cause?: PgError })?.cause ?? e) as PgError;
  const known = err?.constraint ? FRIENDLY[err.constraint] : undefined;
  if (known && (err.code === "23505" || err.code === "23514")) throw new RuleError(known.message, known.field);
  throw e;
}
