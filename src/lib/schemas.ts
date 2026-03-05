/**
 * Lightweight field-level validation for all public forms.
 * Returns { success: true } or { success: false, errors: Record<field, message> }.
 */

type ValidationResult =
  | { success: true }
  | { success: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function required(value: unknown, message: string): string | null {
  if (!value || String(value).trim() === "") return message;
  return null;
}

function validEmail(value: unknown, message: string): string | null {
  if (!value || !EMAIL_RE.test(String(value))) return message;
  return null;
}

function addError(
  errors: Record<string, string>,
  field: string,
  message: string | null
) {
  if (message) errors[field] = message;
}

// ─── Contact form ─────────────────────────────────────────────────────────────

export interface ContactFormValues {
  businessName: string;
  name: string;
  email: string;
  neighborhood: string;
  services: string[];
  message: string;
}

export function validateContactForm(data: ContactFormValues): ValidationResult {
  const errors: Record<string, string> = {};
  addError(errors, "businessName", required(data.businessName, "Business name is required"));
  addError(errors, "name", required(data.name, "Your name is required"));
  addError(errors, "email", validEmail(data.email, "Enter a valid email address"));
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true };
}

// ─── Application form ─────────────────────────────────────────────────────────

export interface ApplicationFormValues {
  fullName: string;
  email: string;
  city: string;
  schoolName: string;
  grade: string;
  referral: string;
  tracks: string[];
  hasResume: boolean | null;
  tools: string;
  accomplishment: string;
}

export function validateApplicationForm(
  data: ApplicationFormValues
): ValidationResult {
  const errors: Record<string, string> = {};
  addError(errors, "fullName", required(data.fullName, "Full name is required"));
  addError(errors, "email", validEmail(data.email, "Enter a valid email address"));
  addError(errors, "city", required(data.city, "City, state is required"));
  addError(errors, "schoolName", required(data.schoolName, "School name is required"));
  addError(errors, "grade", required(data.grade, "Select your grade"));
  addError(errors, "referral", required(data.referral, "Select how you heard about us"));
  if (data.tracks.length === 0) errors.tracks = "Select at least one track";
  if (data.hasResume === null) errors.hasResume = "Indicate whether you have a resume";
  if (data.hasResume === false) {
    addError(errors, "tools", required(data.tools, "List your tools or software"));
    addError(errors, "accomplishment", required(data.accomplishment, "Describe your accomplishment"));
  }
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true };
}

// ─── Inquiry form ─────────────────────────────────────────────────────────────

export interface InquiryFormValues {
  name: string;
  email: string;
  inquiry: string;
}

export function validateInquiryForm(data: InquiryFormValues): ValidationResult {
  const errors: Record<string, string> = {};
  addError(errors, "name", required(data.name, "Name is required"));
  addError(errors, "email", validEmail(data.email, "Enter a valid email address"));
  addError(errors, "inquiry", required(data.inquiry, "Please enter your inquiry"));
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true };
}
