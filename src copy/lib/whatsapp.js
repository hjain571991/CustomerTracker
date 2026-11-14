/**
 * Opening a WhatsApp chat with a customer.
 *
 * A web link cannot *place* a WhatsApp voice call — WhatsApp publishes no URL
 * for it. What `wa.me` does is open the chat with that contact, from which the
 * call button is one tap away. So this is a "message them" link that happens to
 * be the fastest route to a WhatsApp call, and the UI says WhatsApp rather than
 * Call so nobody expects their phone to start ringing.
 *
 * Numbers in the book are written the way a shop writes them — ten digits, no
 * country code — but `wa.me` needs the full international number with no plus
 * and no spaces. The default is India (+91), which is what this book holds.
 * A number that already carries a country code is left with the one it has:
 * prefixing 91 onto a Dubai number would produce a link to a stranger.
 */

/** India. The book is Indian, and the app's dates are pinned to en-IN too. */
export const DEFAULT_COUNTRY_CODE = "91";

// E.164: at most 15 digits including the country code. Below 10 (a local
// number plus its code) there is nothing WhatsApp could dial.
const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

/**
 * A stored phone number as WhatsApp wants it: digits only, country code
 * included. Returns null when there is nothing usable to link to.
 */
export function whatsappNumber(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // `00` is the written-out international prefix, so what follows is already a
  // country code.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // A single leading zero is the domestic trunk prefix and is never dialled
  // internationally.
  else if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (!digits) return null;

  // Ten digits is a bare Indian number; anything longer already carries a code.
  if (digits.length === 10) digits = countryCode + digits;

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

/** The click-to-chat link, or null when the number cannot be used. */
export function whatsappLink(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  const number = whatsappNumber(phone, countryCode);
  return number ? `https://wa.me/${number}` : null;
}

/** Whether a WhatsApp button is worth showing for this customer at all. */
export const canWhatsApp = (customer) => whatsappNumber(customer?.phone) !== null;
