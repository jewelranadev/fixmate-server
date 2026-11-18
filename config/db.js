import { MongoClient } from "mongodb";

let client;
let db;

export async function connectDB() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing in .env");

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.DB_NAME || "fixmate");
  await ensureIndexes(db);
  console.log("MongoDB connected:", db.databaseName);
  return db;
}

export function getDB() {
  if (!db) throw new Error("Database not connected yet");
  return db;
}

export const collections = {
  services: () => getDB().collection("services"),
  bookings: () => getDB().collection("bookings"),
  payments: () => getDB().collection("payments"),
};

async function ensureIndexes(db) {
  await db
    .collection("payments")
    .createIndex({ stripeSessionId: 1 }, { unique: true });

  await db
    .collection("payments")
    .createIndex({ bookingId: 1 }, { unique: true });

  await db.collection("services").createIndex({ technicianEmail: 1 });
  await db
    .collection("services")
    .createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 });
  await db.collection("bookings").createIndex({ customerEmail: 1 });
  await db.collection("bookings").createIndex({ technicianEmail: 1 });
  await db
    .collection("bookings")
    .createIndex({ serviceId: 1, customerEmail: 1 });
}
