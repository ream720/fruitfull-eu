import { isAllowedShippingCountry } from "./countries";

export interface ReservationPayload {
  dropId: string;
  items: Array<{ itemId: string; quantity: number }>;
  customer: {
    name: string;
    email: string;
    phone: string;
    paymentMethod: string;
    paymentName: string;
    notes?: string;
  };
  shipping: {
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    countryCode: string;
  };
  privacyAccepted: true;
  reservationTermsAccepted: true;
  turnstileToken: string;
  idempotencyKey: string;
  website?: string;
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const normalizePhone = (value: string) => {
  const normalized = value.trim().replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "";
};

export const validateReservation = (input: unknown) => {
  const source = input && typeof input === "object" ? input as Record<string, any> : {};
  const customer = source.customer && typeof source.customer === "object" ? source.customer : {};
  const shipping = source.shipping && typeof source.shipping === "object" ? source.shipping : {};
  const errors: Record<string, string> = {};
  const email = text(customer.email, 254).toLowerCase();
  const phone = normalizePhone(text(customer.phone, 32));
  const countryCode = text(shipping.countryCode, 2).toUpperCase();
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items = rawItems.slice(0, 25).map((item: any) => ({
    itemId: text(item?.itemId, 80),
    quantity: Number(item?.quantity),
  }));

  if (!text(source.dropId, 80)) errors.dropId = "Choose an available drop.";
  if (!items.length || items.some((item) => !item.itemId || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    errors.items = "Choose at least one available item and quantity.";
  }
  if (text(customer.name, 120).length < 2) errors.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Use an international phone number beginning with + and country code.";
  if (text(customer.paymentMethod, 50) !== "PayPal") errors.paymentMethod = "PayPal is the accepted payment method.";
  if (text(customer.paymentName, 120).length < 2) errors.paymentName = "Enter the PayPal email or username where we should send the payment request.";
  if (!text(shipping.line1, 160)) errors.line1 = "Enter the delivery address.";
  if (!text(shipping.city, 100)) errors.city = "Enter the city or town.";
  if (!text(shipping.postalCode, 24)) errors.postalCode = "Enter the postcode.";
  if (!isAllowedShippingCountry(countryCode)) errors.countryCode = "Choose a supported European destination.";
  if (source.privacyAccepted !== true) errors.privacyAccepted = "Accept the privacy notice.";
  if (source.reservationTermsAccepted !== true) errors.reservationTermsAccepted = "Accept the 48-hour reservation terms.";
  if (!text(source.turnstileToken, 2048)) errors.turnstileToken = "Complete the security check.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(source.idempotencyKey, 36))) {
    errors.idempotencyKey = "Refresh the page and try again.";
  }

  const payload: ReservationPayload = {
    dropId: text(source.dropId, 80),
    items,
    customer: {
      name: text(customer.name, 120), email, phone,
      paymentMethod: text(customer.paymentMethod, 50),
      paymentName: text(customer.paymentName, 120),
      notes: text(customer.notes, 2000) || undefined,
    },
    shipping: {
      line1: text(shipping.line1, 160), line2: text(shipping.line2, 160) || undefined,
      city: text(shipping.city, 100), region: text(shipping.region, 100) || undefined,
      postalCode: text(shipping.postalCode, 24), countryCode,
    },
    privacyAccepted: true,
    reservationTermsAccepted: true,
    turnstileToken: text(source.turnstileToken, 2048),
    idempotencyKey: text(source.idempotencyKey, 36),
    website: text(source.website, 120) || undefined,
  };
  return { success: Object.keys(errors).length === 0, errors, payload };
};
