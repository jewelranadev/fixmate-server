import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import servicesRouter from "./routes/services.js";   // ফাইলের ওপরে অন্য import-এর সাথে
import { verifyToken, verifyCustomer, verifyTechnician, verifyAdmin } from "./middleware/auth.js";

app.get("/api/test/me", verifyToken, (req, res) => res.json({ success: true, user: req.user }));
app.get("/api/test/technician", verifyToken, verifyTechnician, (req, res) => res.json({ success: true, message: "technician ok" }));
app.get("/api/test/admin", verifyToken, verifyAdmin, (req, res) => res.json({ success: true, message: "admin ok" }));

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// Health check: proves the server and database are alive
app.get("/", (req, res) => {
  res.json({ message: "FixMate server is running" });
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


app.use("/api/services", servicesRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});
start();