import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";

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

start();