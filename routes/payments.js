import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyToken, verifyCustomer } from "../middleware/auth.js";

const router = Router();

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