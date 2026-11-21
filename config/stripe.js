import Stripe from "stripe";

let stripe;

// Loaded lazily so non-payment routes can still start when Stripe is not
// configured locally. The secret key is never sent to the browser.
export function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing in .env");
    stripe = new Stripe(key);
  }
  return stripe;
}

export function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is missing in .env");
  return secret;
}

// Same origin the CORS layer allows. Stripe returns the customer here.
export function getFrontendUrl() {
  return (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");
}
