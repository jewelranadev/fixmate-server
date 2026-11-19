import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import servicesRouter from "./routes/services.js";
import { verifyToken, verifyCustomer, verifyTechnician, verifyAdmin } from "./middleware/auth.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "FixMate server is running" });
});

// Real routes
app.use("/api/services", servicesRouter);

// TEMPORARY test routes: delete after testing
app.get("/api/test/me", verifyToken, (req, res) => res.json({ success: true, user: req.user }));
app.get("/api/test/technician", verifyToken, verifyTechnician, (req, res) => res.json({ success: true, message: "technician ok" }));
app.get("/api/test/admin", verifyToken, verifyAdmin, (req, res) => res.json({ success: true, message: "admin ok" }));

// 404 and error handlers must come AFTER all routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

async function start() {
  try {
    await connectDB();
    app.listen(port, () => console.log(`Server listening on port ${port}`));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

start();