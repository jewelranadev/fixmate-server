import { Router } from "express";
import { collections } from "../config/db.js";
import { ObjectId } from "mongodb";

const CATEGORIES = ["Smartphone", "Laptop & PC", "AC", "Refrigerator", "TV", "Washing Machine", "Electrical"];
const SERVICE_MODES = ["Home Visit", "Shop Drop-off"];
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { basePrice: 1, _id: -1 },
  price_desc: { basePrice: -1, _id: -1 },
};

// Escape user text so it cannot break (or abuse) the regular expression
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const router = Router();

// GET /api/services  (public): only approved AND available services
router.get("/", async (req, res) => {
  try {
    const { q, category, serviceMode, sort, limit } = req.query;

    const filter = { approvalStatus: "approved", isAvailable: true };

    if (typeof category === "string" && CATEGORIES.includes(category)) {
      filter.category = category;
    }
    if (typeof serviceMode === "string" && SERVICE_MODES.includes(serviceMode)) {
      filter.serviceMode = serviceMode;
    }
    if (typeof q === "string" && q.trim()) {
      const pattern = new RegExp(escapeRegex(q.trim()), "i");
      filter.$or = [{ title: pattern }, { category: pattern }];
    }

    const sortBy = SORTS[sort] || SORTS.newest;

    let cursor = collections.services().find(filter).sort(sortBy);
    const max = Number.parseInt(limit, 10);
    if (Number.isInteger(max) && max > 0) cursor = cursor.limit(Math.min(max, 50));

    const services = await cursor.toArray();
    res.json({ success: true, count: services.length, services });
  } catch (error) {
    console.error("GET /api/services failed:", error);
    res.status(500).json({ success: false, message: "Failed to load services" });
  }
});

// GET /api/services/:id  (public)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }
    const service = await collections
      .services()
      .findOne({ _id: new ObjectId(id), approvalStatus: "approved", isAvailable: true });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }
    res.json({ success: true, service });
  } catch (error) {
    console.error("GET /api/services/:id failed:", error);
    res.status(500).json({ success: false, message: "Failed to load service" });
  }
});

export default router;