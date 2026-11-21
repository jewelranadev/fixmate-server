import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyToken, verifyCustomer } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";
import { getFrontendUrl, getStripe } from "../config/stripe.js";
import {
  getSessionBookingId,
  markPaymentPaid,
  paymentView,
  recordCheckoutSession,
} from "../utils/payment.js";

const router = Router();

// CUSTOMER: create a Stripe Checkout Session for one of my completed bookings.
// The amount comes from the booking in MongoDB, never from the request body.
router.post("/create-checkout-session", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const id = parseId(req.body?.bookingId);
    if (!id) {
      return res.status(400).json({ success: false, message: "A valid booking ID is required" });
    }

    const booking = await collections
      .bookings()
      .findOne({ _id: id, customerEmail: req.user.email });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.status !== "completed") {
      return res
        .status(409)
        .json({ success: false, message: "Only completed bookings can be paid" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(409).json({ success: false, message: "This booking is already paid" });
    }

    const amount = Number(booking.finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(409).json({ success: false, message: "This booking has no payable amount" });
    }

    const frontendUrl = getFrontendUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: { name: booking.serviceTitle || "FixMate repair service" },
          },
          quantity: 1,
        },
      ],
      customer_email: booking.customerEmail,
      // Used to tie the Stripe result back to the booking in webhook/verify.
      client_reference_id: String(booking._id),
      metadata: { bookingId: String(booking._id) },
      success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel?booking_id=${encodeURIComponent(
        String(booking._id)
      )}&session_id={CHECKOUT_SESSION_ID}`,
    });

    const saved = await recordCheckoutSession({ booking, session });
    if (!saved) {
      // A paid row appeared between the check and the write: abandon this session.
      await getStripe().checkout.sessions.expire(session.id).catch(() => {});
      return res.status(409).json({ success: false, message: "This booking is already paid" });
    }

    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "This booking is already paid" });
    }
    console.error("POST /api/payments/create-checkout-session failed:", error);
    return res.status(500).json({ success: false, message: "Could not start the payment" });
  }
});

// CUSTOMER: verify the session with Stripe before showing a success state.
// The session_id query parameter is only a lookup key, never proof of payment.
router.get("/verify", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      return res.status(400).json({ success: false, message: "A payment session is required" });
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId.trim());
    const id = parseId(getSessionBookingId(session));
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid payment session" });
    }

    const booking = await collections
      .bookings()
      .findOne({ _id: id, customerEmail: req.user.email });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // If Stripe says paid but the webhook has not landed yet, run the same
    // idempotent persistence used by the webhook. Never trust the query param.
    if (session.payment_status === "paid") {
      await markPaymentPaid({ session });
    }

    const payment = await collections.payments().findOne({ bookingId: String(id) });
    return res.json({
      success: true,
      payment: paymentView(payment) || {
        bookingId: String(id),
        serviceTitle: booking.serviceTitle,
        amount: booking.finalAmount,
        currency: "usd",
        transactionId: null,
        stripeSessionId: session.id,
        paymentStatus: booking.paymentStatus,
        paidAt: null,
      },
      stripePaymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error("GET /api/payments/verify failed:", error);
    return res.status(400).json({ success: false, message: "Invalid or expired payment session" });
  }
});

// CUSTOMER: my payment history only
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const payments = await collections
      .payments()
      .find({ customerEmail: req.user.email })
      .sort({ paidAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    console.error("GET /api/payments/my failed:", error);
    res.status(500).json({ success: false, message: "Failed to load payments" });
  }
});

export default router;
