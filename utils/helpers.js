import { ObjectId } from "mongodb";

// Returns an ObjectId, or null when the text is not a valid 24-char id
export const parseId = (id) => (/^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null);