import { Router } from "express";
import { collections } from "../config/db.js";
import { CATEGORIES, SERVICE_MODES } from "../config/constants.js";
import { verifyToken, verifyTechnician } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";
import { validateService } from "../utils/validateService.js";

const router = Router();

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { basePrice: 1, _id: -1 },
  price_desc: { basePrice: -1, _id: -1 },
};
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// PUBLIC: approved + available services with server-side search/filter/sort
router.get("/", async (req, res) => {
  try {
    const { q, category, serviceMode, sort, limit } = req.query;
    const filter = { approvalStatus: "approved", isAvailable: true };

    if (typeof category === "string" && CATEGORIES.includes(category)) filter.category = category;
    if (typeof serviceMode === "string" && SERVICE_MODES.includes(serviceMode)) filter.serviceMode = serviceMode;
    if (typeof q === "string" && q.trim()) {
      const pattern = new RegExp(escapeRegex(q.trim()), "i");
      filter.$or = [{ title: pattern }, { category: pattern }];
    }

    let cursor = collections.services().find(filter).sort(SORTS[sort] || SORTS.newest);
    const max = Number.parseInt(limit, 10);
    if (Number.isInteger(max) && max > 0) cursor = cursor.limit(Math.min(max, 50));

    const services = await cursor.toArray();
    res.json({ success: true, count: services.length, services });
  } catch (error) {
    console.error("GET /api/services failed:", error);
    res.status(500).json({ success: false, message: "Failed to load services" });
  }
});

// TECHNICIAN: only my own services (must be declared BEFORE "/:id")
router.get("/mine", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const services = await collections
      .services()
      .find({ technicianEmail: req.user.email })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    res.json({ success: true, count: services.length, services });
  } catch (error) {
    console.error("GET /api/services/mine failed:", error);
    res.status(500).json({ success: false, message: "Failed to load your services" });
  }
});

// PUBLIC: one approved + available service
router.get("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Service not found" });

    const service = await collections
      .services()
      .findOne({ _id: id, approvalStatus: "approved", isAvailable: true });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });

    res.json({ success: true, service });
  } catch (error) {
    console.error("GET /api/services/:id failed:", error);
    res.status(500).json({ success: false, message: "Failed to load service" });
  }
});

// TECHNICIAN: create (always starts pending + available)
router.post("/", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { errors, data } = validateService(req.body, { requireImage: true });
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    const doc = {
      ...data,
      technicianName: req.user.name,     // from the verified user, never from the body
      technicianEmail: req.user.email,
      approvalStatus: "pending",
      isAvailable: true,
      createdAt: new Date(),
    };
    const result = await collections.services().insertOne(doc);
    res.status(201).json({ success: true, service: { _id: result.insertedId, ...doc } });
  } catch (error) {
    console.error("POST /api/services failed:", error);
    res.status(500).json({ success: false, message: "Failed to create service" });
  }
});

// TECHNICIAN: edit (back to pending) OR toggle availability (no re-approval)
router.patch("/:id", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Service not found" });

    const body = req.body || {};
    const keys = Object.keys(body);
    let update;

    if (keys.length === 1 && keys[0] === "isAvailable") {
      if (typeof body.isAvailable !== "boolean") {
        return res.status(400).json({ success: false, message: "isAvailable must be true or false" });
      }
      update = { $set: { isAvailable: body.isAvailable } };
    } else {
      const { errors, data } = validateService(body, { requireImage: false });
      if (Object.keys(errors).length) {
        return res.status(400).json({ success: false, message: "Validation failed", errors });
      }
      const changes = { ...data, approvalStatus: "pending" }; // assignment rule: edit => pending
      if (!changes.image) delete changes.image;               // keep the old image if none sent
      update = { $set: changes };
    }

    // The owner check lives IN the query: someone else's service simply is not found
    const service = await collections
      .services()
      .findOneAndUpdate({ _id: id, technicianEmail: req.user.email }, update, { returnDocument: "after" });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });

    res.json({ success: true, service });
  } catch (error) {
    console.error("PATCH /api/services/:id failed:", error);
    res.status(500).json({ success: false, message: "Failed to update service" });
  }
});

// TECHNICIAN: delete own service (old bookings keep their copied snapshot)
router.delete("/:id", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ success: false, message: "Service not found" });

    const result = await collections.services().deleteOne({ _id: id, technicianEmail: req.user.email });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, message: "Service not found" });

    res.json({ success: true, message: "Service deleted" });
  } catch (error) {
    console.error("DELETE /api/services/:id failed:", error);
    res.status(500).json({ success: false, message: "Failed to delete service" });
  }
});

export default router;