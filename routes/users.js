import { Router } from "express";
import { collections } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";
import { parseId } from "../utils/helpers.js";
import { validateProfile } from "../utils/validateProfile.js";

const router = Router();

const EDITABLE_FIELDS = ["name", "phone", "area", "bio", "image"];

// Authenticated user updates only their own profile. The user identity comes
// from the verified JWT/database lookup in verifyToken, never from the body.
router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const body = req.body || {};
    const hasEditableField = EDITABLE_FIELDS.some((field) => field in body);
    if (!hasEditableField) {
      return res.status(400).json({
        success: false,
        message: "No editable profile fields were provided",
      });
    }

    const { errors, data } = validateProfile(body);
    if (Object.keys(errors).length) {
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid profile fields were provided",
      });
    }

    const id = parseId(req.user.id);
    if (!id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const updated = await collections.users().findOneAndUpdate(
      { _id: id },
      { $set: data },
      { returnDocument: "after" },
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = {
      id: String(updated._id),
      name: updated.name ?? "",
      email: updated.email ?? "",
      role: updated.role ?? "customer",
      image: updated.image ?? "",
      phone: updated.phone ?? "",
      area: updated.area ?? "",
      bio: updated.bio ?? "",
      createdAt: updated.createdAt ?? "",
    };

    res.json({ success: true, user });
  } catch (error) {
    console.error("PATCH /api/users/profile failed:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
  }
});

export default router;
