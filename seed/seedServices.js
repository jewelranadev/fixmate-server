import "dotenv/config";
import { connectDB, collections } from "../config/db.js";
import { services as mockServices } from "./mockServices.js";

async function run() {
  await connectDB();

  for (const item of mockServices) {
    const { _id, createdAt, ...rest } = item;
    await collections.services().updateOne(
      { title: rest.title, technicianEmail: rest.technicianEmail },
      { $setOnInsert: { ...rest, createdAt: new Date(createdAt) } },
      { upsert: true }
    );
  }

  console.log("Seeded services:", await collections.services().countDocuments());
  process.exit(0);
}

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});