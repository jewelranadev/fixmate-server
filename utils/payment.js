import { collections } from "../config/db.js";
import { parseId } from "./helpers.js";

// Stripe puts the booking id on the Checkout Session; the query string in the
// browser is only an opaque session id and is never trusted on its own.
const bookingIdOf = (session) =>
  session?.metadata?.bookingId || session?.client_reference_id || null;

const amountOf = (session, fallback) => {
  const cents = Number(session?.amount_total);
  if (Number.isFinite(cents) && cents >= 0) return cents / 100;
  const amount = Number(fallback);
  return Number.isFinite(amount) ? amount : 0;
};

const paymentIntentOf = (session) => {
  const value = session?.payment_intent;
  return typeof value === "string" ? value : value?.id || null;
};

const paidAtOf = (session) => {
  const seconds = Number(session?.created);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : new Date();
};

export const getSessionBookingId = (session) => bookingIdOf(session);

// One payment row per booking (unique bookingId index). Opening a new Checkout
// Session only refreshes the session id on that row; a paid row is never reset.
export async function recordCheckoutSession({ booking, session }) {
  const bookingId = String(booking._id);

  try {
    return await collections.payments().findOneAndUpdate(
      { bookingId, paymentStatus: { $ne: "paid" } },
      {
        $set: {
          stripeSessionId: session.id,
          amount: amountOf(session, booking.finalAmount),
          currency: (session.currency || "usd").toLowerCase(),
          paymentStatus: "unpaid",
          transactionId: null,
          paidAt: null,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          serviceTitle: booking.serviceTitle || "",
          customerName: booking.customerName || "",
          customerEmail: booking.customerEmail || "",
          technicianName: booking.technicianName || "",
          technicianEmail: booking.technicianEmail || "",
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    // A concurrent request may have paid/inserted first: never create a second row.
    if (error?.code === 11000) return null;
    throw error;
  }
}

// Shared by the webhook and the verify endpoint, so both paths persist the
// exact same verified state. Safe to call more than once for the same session.
export async function markPaymentPaid({ session }) {
  const id = parseId(bookingIdOf(session));
  if (!id) return { processed: false, reason: "invalid booking id" };

  const booking = await collections.bookings().findOne({ _id: id });
  if (!booking) return { processed: false, reason: "booking not found" };

  const bookingId = String(booking._id);
  const paidAt = paidAtOf(session);
  const syncBooking = () =>
    collections
      .bookings()
      .updateOne(
        { _id: id, paymentStatus: { $ne: "paid" } },
        { $set: { paymentStatus: "paid" } }
      );

  const existing = await collections.payments().findOne({ bookingId });
  if (existing?.paymentStatus === "paid") {
    await syncBooking();
    return { processed: false, alreadyProcessed: true, payment: existing };
  }

  let payment;
  try {
    payment = await collections.payments().findOneAndUpdate(
      { bookingId, paymentStatus: { $ne: "paid" } },
      {
        $set: {
          stripeSessionId: session.id,
          paymentStatus: "paid",
          transactionId: paymentIntentOf(session),
          amount: amountOf(session, booking.finalAmount),
          currency: (session.currency || "usd").toLowerCase(),
          paidAt,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          serviceTitle: booking.serviceTitle || "",
          customerName: booking.customerName || "",
          customerEmail: booking.customerEmail || "",
          technicianName: booking.technicianName || "",
          technicianEmail: booking.technicianEmail || "",
          createdAt: paidAt,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    payment = null;
  }

  await syncBooking();

  if (!payment) {
    return {
      processed: false,
      alreadyProcessed: true,
      payment: await collections.payments().findOne({ bookingId }),
    };
  }

  return { processed: true, alreadyProcessed: false, payment };
}

// Expired / failed Checkout Sessions stay unpaid. No booking is touched and no
// payment row is invented, so the customer can safely start a new session.
export async function markPaymentNotPaid({ session }) {
  const rawBookingId = bookingIdOf(session);
  if (!rawBookingId) return { processed: false };

  const payment = await collections.payments().findOne({
    bookingId: String(rawBookingId),
    stripeSessionId: session.id,
  });
  if (!payment || payment.paymentStatus === "paid") {
    return { processed: false, alreadyFinal: true };
  }

  await collections.payments().updateOne(
    { _id: payment._id },
    { $set: { paymentStatus: "unpaid", updatedAt: new Date() } }
  );
  return { processed: true };
}

// Shape returned to the client. Uses the existing payment schema fields.
export function paymentView(payment) {
  if (!payment) return null;

  return {
    _id: String(payment._id),
    bookingId: payment.bookingId,
    serviceTitle: payment.serviceTitle,
    customerName: payment.customerName,
    customerEmail: payment.customerEmail,
    technicianName: payment.technicianName,
    technicianEmail: payment.technicianEmail,
    amount: payment.amount,
    currency: payment.currency,
    transactionId: payment.transactionId,
    stripeSessionId: payment.stripeSessionId,
    paymentStatus: payment.paymentStatus,
    paidAt: payment.paidAt,
  };
}
