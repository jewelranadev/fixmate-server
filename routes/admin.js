import { Router } from "express";
import { collections } from "../config/db.js";
import { APPROVAL_STATUSES } from "../config/constants.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";

const router = Router();

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