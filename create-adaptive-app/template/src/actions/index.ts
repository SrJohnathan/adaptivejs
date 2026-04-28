"server";

import { AdaptiveFormData } from "@adaptivejs/web";
import { isAdaptiveFormData } from "@adaptivejs/web";

type SubscribeInput = AdaptiveFormData;

export async function subscribe(input: SubscribeInput) {
  const email = readEmail(input);
  const attachment = readAttachment(input);
  return {
    ok: true,
    email: email ?? null,
    attachmentName: attachment?.name ?? null,
    message: email
      ? `Subscription received for ${email}${attachment ? ` with ${attachment.name}.` : "."}`
      : "No email was provided."
  };
}

function readEmail(input: SubscribeInput) {
  if (!isAdaptiveFormData(input)) {
    return undefined;
  }
  const value = input.get("email");
  return typeof value === "string" ? value : undefined;
}

function readAttachment(input: SubscribeInput) {
  if (!isAdaptiveFormData(input)) {
    return null;
  }
  const value = input.get("attachment");
  return value instanceof File ? value : null;
}
