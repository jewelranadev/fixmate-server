import { pathToFileURL } from "node:url";
import "dotenv/config";
import { connectDB, collections } from "../config/db.js";
import { services as mockServices } from "./mockservices.js";

// Kept as a named function so `seed:all` can seed services before accounts.
// Uses $setOnInsert with a stable title + technicianEmail filter: re-running
// never changes existing rows and never creates duplicates.
export async function seedServices() {
  for (const item of mockServices) {
    const { _id, createdAt, ...rest } = item;
    await collections.services().updateOne(
      { title: rest.title, technicianEmail: rest.technicianEmail },
      { $setOnInsert: { ...rest, createdAt: new Date(createdAt) } },
      { upsert: true }
    );
  }

  return collections.services().countDocuments();
}

async function run() {
  await connectDB();
  console.log("Seeded services:", await seedServices());
  process.exit(0);
}

// Only exit the process when invoked directly by `npm run seed:services`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
}
