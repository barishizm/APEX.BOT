// Masks personal data before anything reaches the logs: emails, phone numbers,
// card numbers (Luhn-checked) and Turkish IBANs.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\bTR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{2}\b/gi;
// 13-19 digits, optionally grouped by spaces or dashes.
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
// International or local numbers with at least 10 digits, e.g. +90 532 123 45 67, (0532) 123-4567.
const PHONE = /(?:\+\d{1,3}[ .-]?)?\(?\d{3,4}\)?[ .-]?\d{3}[ .-]?\d{2}[ .-]?\d{2,4}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function maskPII(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(IBAN, "[iban]")
    .replace(CARD, (match) => (luhn(match.replace(/\D/g, "")) ? "[card]" : match))
    .replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 10 ? "[phone]" : match));
}
