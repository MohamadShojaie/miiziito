export const PANEL_GUIDE_PATH = "/guides/miiziito-panel-guide.html";

export type AccessCredentialsPayload = {
  type: "access_credentials";
  menuUrl?: string;
  adminUrl?: string;
  cashierPassword?: string;
  accountUrl?: string;
  accountEmail?: string;
  accountPassword?: string;
  accountPasswordNote?: string;
  guideUrl?: string;
};

export type SupportMessageLike = {
  id: string;
  from: string;
  body: string;
  createdAt: string;
  payload?: AccessCredentialsPayload | Record<string, unknown>;
};

function lineAfter(label: string, lines: string[]): string {
  const i = lines.findIndex((l) => l.trim() === label || l.includes(label));
  if (i < 0) return "";
  return (lines[i + 1] || "").trim();
}

/** Parse structured payload, or recover fields from legacy plain-text access tickets. */
export function resolveAccessPayload(
  message: SupportMessageLike,
  _subject?: string
): AccessCredentialsPayload | null {
  const raw = message.payload;
  if (raw && typeof raw === "object" && (raw as AccessCredentialsPayload).type === "access_credentials") {
    return {
      guideUrl: PANEL_GUIDE_PATH,
      ...(raw as AccessCredentialsPayload),
    };
  }

  const body = message.body || "";
  // Only treat THIS message as credentials when its own body looks like an access dump.
  // Ticket subject alone must not turn normal replies into the credentials card.
  const looksLikeAccessBody =
    body.includes("آدرس منو") ||
    body.includes("آدرس پنل مدیریت") ||
    body.includes("رمز ورود پنل مدیریت");
  if (!looksLikeAccessBody) {
    return null;
  }

  const lines = body.split(/\r?\n/);
  const menuUrl = lineAfter("آدرس منو:", lines) || (body.match(/https?:\/\/[^\s]+\/[a-z0-9-]+\/?/i) || [])[0] || "";
  const adminUrl =
    lineAfter("آدرس پنل مدیریت (صندوق):", lines) ||
    lineAfter("آدرس پنل مدیریت:", lines) ||
    "";
  const cashierPassword = lineAfter("رمز ورود پنل مدیریت:", lines);
  const accountUrl = lineAfter("حساب اشتراک (خرید / تمدید / پشتیبانی):", lines);
  const accountEmail = (lineAfter("ایمیل ورود:", lines) || "").replace(/^ایمیل ورود:\s*/, "");
  let accountPassword = lineAfter("رمز حساب اشتراک:", lines);
  let accountPasswordNote = "";
  if (accountPassword.includes("همان رمزی")) {
    accountPasswordNote = accountPassword;
    accountPassword = "";
  }

  if (!menuUrl && !adminUrl && !cashierPassword && !accountUrl) {
    return null;
  }

  return {
    type: "access_credentials",
    menuUrl,
    adminUrl,
    cashierPassword,
    accountUrl,
    accountEmail,
    accountPassword,
    accountPasswordNote,
    guideUrl: PANEL_GUIDE_PATH,
  };
}
