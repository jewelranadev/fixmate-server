import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDB } from "../config/db.js";

let jwks;
const getJwks = () => {
  jwks ??= createRemoteJWKSet(new URL(`${process.env.AUTH_URL}/api/auth/jwks`));
  return jwks;
};

// 401 = "we don't know who you are"
export async function verifyToken(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ success: false, message: "Unauthorized: token missing" });
    }

    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: process.env.AUTH_URL,
      audience: process.env.AUTH_URL,
    });

    // Role comes from the database, never from the token
    const user = await getDB().collection("user").findOne({ email: payload.email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized: user not found" });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      image: user.image || "",
      role: user.role || "customer",
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Unauthorized: invalid or expired token" });
  }
}

// 403 = "we know who you are, but you are not allowed"
const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) {
    return res.status(403).json({ success: false, message: `Forbidden: ${role} access only` });
  }
  next();
};

export const verifyCustomer = requireRole("customer");
export const verifyTechnician = requireRole("technician");
export const verifyAdmin = requireRole("admin");