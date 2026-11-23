const clean = (value) => (typeof value === "string" ? value.trim() : undefined);

// Only whitelisted profile fields are ever read from the request body.
export function validateProfile(body = {}) {
  const errors = {};
  const data = {};

  if ("name" in body) {
    const name = clean(body.name);
    if (!name) errors.name = "Full name is required";
    else if (name.length > 100) errors.name = "Name is too long";
    else data.name = name;
  }

  if ("phone" in body) {
    const phone = clean(body.phone);
    if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) {
      errors.phone = "Enter a valid phone number";
    } else {
      data.phone = phone ?? "";
    }
  }

  if ("area" in body) {
    const area = clean(body.area);
    if (area && area.length > 120) errors.area = "Area is too long";
    else data.area = area ?? "";
  }

  if ("bio" in body) {
    const bio = clean(body.bio);
    if (bio && bio.length > 500) errors.bio = "Bio must be 500 characters or fewer";
    else data.bio = bio ?? "";
  }

  if ("image" in body) {
    const image = clean(body.image);
    if (image && !/^https?:\/\//i.test(image)) {
      errors.image = "Image must be a valid URL";
    } else if (image && image.length > 2048) {
      errors.image = "Image URL is too long";
    } else if (image !== undefined) {
      data.image = image;
    }
  }

  return { errors, data };
}
