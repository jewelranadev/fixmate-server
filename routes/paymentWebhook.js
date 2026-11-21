import { Router } from "express";
import { getStripe, getWebhookSecret } from "../config/stripe.js";
import { markPaymentNotPaid, markPaymentPaid } from "../utils/payment.js";

const router = Router();

// Mounted BEFORE express.json() in index.js: Stripe signatures are computed
// over the exact raw bytes, so the body must stay a Buffer until verification.
router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ received: false, message: "Missing Stripe signature" });
  }

  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      req.body,
      signature,
      getWebhookSecret()
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).json({ received: false, message: "Invalid webhook signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        // Async methods (e.g. bank debit) fire `completed` before the money
        // settles; only a paid session may flip the booking to paid.
        if (event.data.object.payment_status === "paid") {
          await markPaymentPaid({ session: event.data.object });
        }
        break;
      case "checkout.session.async_payment_succeeded":
        await markPaymentPaid({ session: event.data.object });
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await markPaymentNotPaid({ session: event.data.object });
        break;
      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return res
      .status(500)
      .json({ received: false, message: "Webhook processing failed" });
  }
});

export default router;
