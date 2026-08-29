import type { CrmProfile } from "@/lib/crm";
import { customerTierLabel } from "@/lib/crm";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";

export type SmsTemplateId =
  | "followup"
  | "birthday"
  | "welcome"
  | "atrisk"
  | "custom";

export type SmsTemplate = {
  id: SmsTemplateId;
  label: string;
};

export const SMS_TEMPLATES: SmsTemplate[] = [
  { id: "followup", label: "پیگیری" },
  { id: "birthday", label: "تولد" },
  { id: "welcome", label: "خوش‌آمد" },
  { id: "atrisk", label: "بازگشت" },
  { id: "custom", label: "متن آزاد" },
];

export function buildSmsText(
  templateId: SmsTemplateId,
  profile: Pick<CrmProfile, "name" | "tier">,
  cafeName = DEFAULT_CAFE_NAME_FA
): string {
  const name = String(profile.name || "").trim() || "دوست عزیز";
  const tier = customerTierLabel(profile.tier);
  switch (templateId) {
    case "birthday":
      return `سلام ${name} عزیز 🎂\nتولدتان مبارک! منتظر دیدنتان در ${cafeName} هستیم.`;
    case "welcome":
      return `سلام ${name} عزیز، به باشگاه مشتریان ${cafeName} خوش آمدید. از دیدنتان خوشحالیم.`;
    case "atrisk":
      return `سلام ${name} عزیز، دلمان برایتان تنگ شده.\nخوشحال می‌شویم دوباره به ${cafeName} سر بزنید.`;
    case "followup":
      return `سلام ${name} عزیز (${tier})، امیدواریم حالتان خوب باشد.\nمنتظر حضور دوباره شما در ${cafeName} هستیم.`;
    case "custom":
    default:
      return "";
  }
}

/** Shared (non-personalized) copy for group SMS. */
export function buildBulkSmsText(
  templateId: SmsTemplateId,
  cafeName = DEFAULT_CAFE_NAME_FA
): string {
  switch (templateId) {
    case "birthday":
      return `سلام 🎂 تولدتان مبارک!\nمنتظر دیدنتان در ${cafeName} هستیم.`;
    case "welcome":
      return `سلام، به باشگاه مشتریان ${cafeName} خوش آمدید. از دیدنتان خوشحالیم.`;
    case "atrisk":
      return `سلام، دلمان برایتان تنگ شده.\nخوشحال می‌شویم دوباره به ${cafeName} سر بزنید.`;
    case "followup":
      return `سلام، امیدواریم حالتان خوب باشد.\nمنتظر حضور دوباره شما در ${cafeName} هستیم.`;
    case "custom":
    default:
      return "";
  }
}

/** Template text with {{name}} / {{tier}} / {{cafe}} for one-by-one send. */
export function buildPersonalizedBulkSmsText(
  templateId: SmsTemplateId,
  cafeName = DEFAULT_CAFE_NAME_FA
): string {
  switch (templateId) {
    case "birthday":
      return `سلام {{name}} عزیز 🎂\nتولدتان مبارک! منتظر دیدنتان در {{cafe}} هستیم.`;
    case "welcome":
      return `سلام {{name}} عزیز، به باشگاه مشتریان {{cafe}} خوش آمدید. از دیدنتان خوشحالیم.`;
    case "atrisk":
      return `سلام {{name}} عزیز، دلمان برایتان تنگ شده.\nخوشحال می‌شویم دوباره به {{cafe}} سر بزنید.`;
    case "followup":
      return `سلام {{name}} عزیز ({{tier}})، امیدواریم حالتان خوب باشد.\nمنتظر حضور دوباره شما در {{cafe}} هستیم.`;
    case "custom":
    default:
      return "";
  }
}

function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/[^\d+]/g, "");
}

export function phoneDigits(phone: string): string {
  return normalizePhoneDigits(phone);
}

/** Build a URI that opens the device SMS app with recipient + body. */
export function smsComposeHref(phone: string, body: string): string {
  const digits = normalizePhoneDigits(phone);
  const text = encodeURIComponent(body);
  // iOS uses &body= ; Android accepts ?body=
  return `sms:${digits}?&body=${text}`;
}

/** Multi-recipient SMS URI (best supported on Android). */
export function smsComposeHrefMulti(phones: string[], body: string): string {
  const digits = phones
    .map((p) => normalizePhoneDigits(p))
    .filter(Boolean);
  const text = encodeURIComponent(body);
  return `sms:${digits.join(",")}?&body=${text}`;
}

export function personalizeBulkBody(
  body: string,
  profile: Pick<CrmProfile, "name" | "tier">,
  cafeName = DEFAULT_CAFE_NAME_FA
): string {
  const name = String(profile.name || "").trim() || "دوست عزیز";
  const tier = customerTierLabel(profile.tier);
  return body
    .replaceAll("{{name}}", name)
    .replaceAll("{{cafe}}", cafeName)
    .replaceAll("{{tier}}", tier);
}
