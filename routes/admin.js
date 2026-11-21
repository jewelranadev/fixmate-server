import { Router } from "express";
import { collections } from "../config/db.js";
import { APPROVAL_STATUSES } from "../config/constants.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";

const router = Router();

const USER_ROLES = ["customer", "technician", "admin"];
const BOOKING_STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"];

// Explicit view: only the fields the admin UI needs, never BetterAuth internals.
const userView = (user) => ({
  _id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role || "customer",
  area: user.area || "",
  createdAt: user.createdAt,
});

// Every route below needs a valid token AND the admin role
router.use(verifyToken, verifyAdmin);

// All services from all technicians, pending first, optional ?approvalStatus=
router.get("/services", async (req, res) => {
  try {
    const { approvalStatus } = req.query;
    const match = APPROVAL_STATUSES.includes(approvalStatus) ? { approvalStatus } : {};

    const services = await collections
      .services()
      .aggregate([
        { $match: match },
        { $addFields: { _pendingFirst: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 0, 1] } } },
        { $sort: { _pendingFirst: 1, createdAt: -1, _id: -1 } },
        { $project: { _pendingFirst: 0 } },
      ])
      .toArray();

    res.json({ success: true, count: services.length, services });
  } catch (error) {
    console.error("GET /api/admin/services failed:", error);
    res.status(500).json({ success: false, message: "Failed to load services" });
  }
});

// Approve or reject
router.patch("/services/:id/approval", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Service not found" });

    const { approvalStatus } = req.body || {};
    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: "approvalStatus must be approved or rejected" });
    }

    const service = await collections
      .services()
      .findOneAndUpdate({ _id: id }, { $set: { approvalStatus } }, { returnDocument: "after" });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });

    res.json({ success: true, service });
  } catch (error) {
    console.error("PATCH /api/admin/services/:id/approval failed:", error);
    res.status(500).json({ success: false, message: "Failed to update approval" });
  }
});

// All registered accounts (customers, technicians, admins).
router.get("/users", async (req, res) => {
  try {
    const users = await collections
      .users()
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: users.length, users: users.map(userView) });
  } catch (error) {
    console.error("GET /api/admin/users failed:", error);
    res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

// Admin-only role change. Admins cannot edit their own row, so nobody can
// promote themselves (or accidentally lock themselves out).
router.patch("/users/:id/role", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "User not found" });

    if (String(id) === req.user.id) {
      return res.status(403).json({ success: false, message: "You cannot change your own role" });
    }

    const { role } = req.body || {};
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "role must be customer, technician or admin",
      });
    }

    const user = await collections
      .users()
      .findOneAndUpdate({ _id: id }, { $set: { role } }, { returnDocument: "after" });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: userView(user) });
  } catch (error) {
    console.error("PATCH /api/admin/users/:id/role failed:", error);
    res.status(500).json({ success: false, message: "Failed to update role" });
  }
});

// All bookings across the marketplace, with the same optional status filter
// used by the admin bookings page.
router.get("/bookings", async (req, res) => {
  try {
    const { status } = req.query;
    const match = BOOKING_STATUSES.includes(status) ? { status } : {};

    const bookings = await collections
      .bookings()
      .find(match)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    res.json({
      success: true,
      count: bookings.length,
      bookings: bookings.map((booking) => ({ ...booking, _id: String(booking._id) })),
    });
  } catch (error) {
    console.error("GET /api/admin/bookings failed:", error);
    res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
});

// All payment records for the admin transactions dashboard.
router.get("/payments", async (req, res) => {
  try {
    const payments = await collections
      .payments()
      .find({})
      .sort({ paidAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    console.error("GET /api/admin/payments failed:", error);
    res.status(500).json({ success: false, message: "Failed to load payments" });
  }
});

export default router;