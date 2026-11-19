import { parseId } from "./helpers.js";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

export function validateBookingRequest(body = {}) {
  const data = {
    serviceId: clean(body.serviceId),
    customerPhone: clean(body.customerPhone),
    address: clean(body.address),
    preferredDate: clean(body.preferredDate), // "YYYY-MM-DD"
    problemDescription: clean(body.problemDescription),
  };

  const errors = {};
  if (!parseId(data.serviceId)) errors.serviceId = "Invalid service";
  if (!/^\+?[\d\s-]{7,20}$/.test(data.customerPhone)) errors.customerPhone = "Enter a valid phone number";
  if (data.address.length < 5) errors.address = "Address is required";

  // The round trip rejects impossible dates such as 2026-02-31
  const parsed = new Date(data.preferredDate);
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(data.preferredDate) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === data.preferredDate;

  if (!validDate) errors.preferredDate = "Choose a valid date";
  else if (data.preferredDate < new Date().toISOString().slice(0, 10)) {
    errors.preferredDate = "Choose today or a future date";
  }

  if (data.problemDescription.length < 20) {
    errors.problemDescription = "Describe the problem in at least 20 characters";
  }
  return { errors, data };
}