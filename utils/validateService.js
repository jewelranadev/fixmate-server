import { CATEGORIES, SERVICE_MODES } from "../config/constants.js";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

// Only whitelisted fields are ever read from the request body.
export function validateService(body = {}, { requireImage }) {
  const data = {
    title: clean(body.title),
    category: clean(body.category),
    description: clean(body.description),
    estimatedDuration: clean(body.estimatedDuration),
    serviceMode: clean(body.serviceMode),
    serviceArea: clean(body.serviceArea),
    image: clean(body.image),
    basePrice: Number(body.basePrice),
  };

  const errors = {};
  if (data.title.length < 3) errors.title = "Title must be at least 3 characters";
  if (!CATEGORIES.includes(data.category)) errors.category = "Choose a valid category";
  if (data.description.length < 10) errors.description = "Description must be at least 10 characters";
  if (!Number.isFinite(data.basePrice) || data.basePrice <= 0) errors.basePrice = "Base price must be a positive number";
  if (!data.estimatedDuration) errors.estimatedDuration = "Estimated duration is required";
  if (!SERVICE_MODES.includes(data.serviceMode)) errors.serviceMode = "Choose Home Visit or Shop Drop-off";
  if (!data.serviceArea) errors.serviceArea = "Service area is required";

  if (requireImage && !data.image) errors.image = "Service image is required";
  if (data.image && !/^https?:\/\//i.test(data.image)) errors.image = "Image must be a valid URL";

  return { errors, data };
}