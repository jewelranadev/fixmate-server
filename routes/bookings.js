import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyToken, verifyCustomer, verifyTechnician } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";
import { validateBookingRequest } from "../utils/validateBooking.js";

const router = Router();

const ACTIVE_STATUSES = ["requested", "accepted", "in-progress"];
const BOOKING_STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"];

// The ONLY allowed moves. Anything not listed here is rejected.
const TRANSITIONS = {
  requested: ["accepted", "rejected"],
  accepted: ["in-progress"],
  "in-progress": ["completed"],
};

// ---------------- Commit A: create a repair request ----------------

// CUSTOMER: POST /api/bookings
router.post("/", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { errors, data } = validateBookingRequest(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    const service = await collections
      .services()
      .findOne({ _id: parseId(data.serviceId), approvalStatus: "approved", isAvailable: true });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });

    if (service.technicianEmail === req.user.email) {
      return res.status(403).json({ success: false, message: "You cannot request your own service" });
    }

    const existing = await collections.bookings().findOne({
      serviceId: String(service._id),
      customerEmail: req.user.email,
      status: { $in: ACTIVE_STATUSES },
    });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "You already have an active request for this service" });
    }

    const booking = {
      serviceId: String(service._id),
      // snapshot: the booking stays readable even if the service is edited or deleted later
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      // identity comes from the verified token, never from the request body
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: data.customerPhone,
      address: data.address,
      preferredDate: new Date(data.preferredDate),
      problemDescription: data.problemDescription,
      status: "requested",
      finalAmount: service.basePrice, // default = basePrice (assignment)
      paymentStatus: "unpaid",
      createdAt: new Date(),
    };

    const result = await collections.bookings().insertOne(booking);
    res.status(201).json({ success: true, booking: { _id: result.insertedId, ...booking } });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "You already have an active request for this service" });
    }
    console.error("POST /api/bookings failed:", error);
    res.status(500).json({ success: false, message: "Failed to create booking" });
  }
});

// ---------------- Commit B: ownership and cancellation ----------------

// CUSTOMER: my bookings only
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const bookings = await collections
      .bookings()
      .find({ customerEmail: req.user.email })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error("GET /api/bookings/my failed:", error);
    res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
});

// CUSTOMER: cancel, only while "requested"
router.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Booking not found" });

    const booking = await collections
      .bookings()
      .findOneAndUpdate(
        { _id: id, customerEmail: req.user.email, status: "requested" },
        { $set: { status: "cancelled" } },
        { returnDocument: "after" }
      );
    if (booking) return res.json({ success: true, booking });

    // Why did it fail: someone else's booking / missing, or wrong status?
    const mine = await collections.bookings().findOne({ _id: id, customerEmail: req.user.email });
    if (!mine) return res.status(404).json({ success: false, message: "Booking not found" });
    return res
      .status(409)
      .json({ success: false, message: "Only requested bookings can be cancelled" });
  } catch (error) {
    console.error("PATCH /api/bookings/:id/cancel failed:", error);
    res.status(500).json({ success: false, message: "Failed to cancel booking" });
  }
});

// ---------------- Commit C: technician side and the status pipeline ----------------

// TECHNICIAN: bookings assigned to me, optional ?status=
router.get("/technician", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const filter = { technicianEmail: req.user.email };
    if (BOOKING_STATUSES.includes(req.query.status)) filter.status = req.query.status;

    const bookings = await collections
      .bookings()
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error("GET /api/bookings/technician failed:", error);
    res.status(500).json({ success: false, message: "Failed to load requests" });
  }
});

// TECHNICIAN: move a job one step forward
router.patch("/:id/status", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Booking not found" });

    const { status: next, finalAmount } = req.body || {};

    // Only MY jobs. Someone else's job looks exactly like a missing one.
    const booking = await collections.bookings().findOne({ _id: id, technicianEmail: req.user.email });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    const allowed = TRANSITIONS[booking.status] || [];
    if (!allowed.includes(next)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status change: ${booking.status} -> ${next}`,
      });
    }

    const changes = { status: next };
    if (next === "completed") {
      const amount = Number(finalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "finalAmount must be a number greater than 0" });
      }
      changes.finalAmount = amount;
    }

    // The old status is part of the filter, so two quick clicks cannot both succeed
    const updated = await collections
      .bookings()
      .findOneAndUpdate(
        { _id: id, technicianEmail: req.user.email, status: booking.status },
        { $set: changes },
        { returnDocument: "after" }
      );
    if (!updated) {
      return res
        .status(409)
        .json({ success: false, message: "This booking was just updated. Please refresh." });
    }

    res.json({ success: true, booking: updated });
  } catch (error) {
    console.error("PATCH /api/bookings/:id/status failed:", error);
    res.status(500).json({ success: false, message: "Failed to update booking" });
  }
});

export default router;