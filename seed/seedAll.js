import "dotenv/config";
import { connectDB, collections, getDB } from "../config/db.js";

const AUTH_URL = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.SEED_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fixmate.example";

if (!PASSWORD) {
  console.error("Set SEED_PASSWORD in .env first");
  process.exit(1);
}

// Uses BetterAuth's own endpoint, so password hashing is done correctly
async function signUp({ name, email, role }) {
  const response = await fetch(`${AUTH_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: AUTH_URL },
    body: JSON.stringify({ name, email, password: PASSWORD, role }),
  });
  if (response.ok) return "created";
  const text = await response.text();
  if (/exist/i.test(text)) return "exists";
  throw new Error(`Sign-up failed for ${email}: ${response.status} ${text}`);
}

const CUSTOMERS = [
  { name: "Sarah Ahmed", email: "sarah.ahmed@fixmate.example" },
  { name: "Rafi Hasan", email: "rafi.hasan@fixmate.example" },
  { name: "Nadia Karim", email: "nadia.karim@fixmate.example" },
];

const PROBLEMS = [
  "The device will not turn on after it fell from the table yesterday.",
  "The screen flickers constantly and the touch response is very slow.",
  "It makes a loud noise and stops working after a few minutes of use.",
  "The unit is not cooling properly even after cleaning the filters.",
  "It started leaking water and there is a burning smell near the plug.",
  "Battery drains within an hour and the device gets extremely hot.",
];

// service index (by creation order) -> customer -> status
const PLAN = [
  { svc: 0, customer: 0, status: "requested" },
  { svc: 1, customer: 0, status: "accepted" },
  { svc: 2, customer: 0, status: "in-progress" },
  { svc: 3, customer: 0, status: "completed", paid: false, extra: 15 },
  { svc: 4, customer: 0, status: "completed", paid: true },
  { svc: 5, customer: 1, status: "completed", paid: true, extra: 10 },
  { svc: 6, customer: 1, status: "rejected" },
  { svc: 7, customer: 1, status: "cancelled" },
  { svc: 8, customer: 1, status: "requested" },
  { svc: 9, customer: 2, status: "in-progress" },
];

async function run() {
  await connectDB();

  const services = await collections
    .services()
    .find({ approvalStatus: "approved" })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  if (services.length < 12) {
    console.error(`Only ${services.length} approved services found. Run "npm run seed:services" first.`);
    process.exit(1);
  }

  // 1. Accounts (technicians come from the services that were seeded)
  const technicians = new Map();
  services.forEach((s) => technicians.set(s.technicianEmail, s.technicianName));

  const accounts = [
    ...[...technicians].map(([email, name]) => ({ name, email, role: "technician" })),
    ...CUSTOMERS.map((c) => ({ ...c, role: "customer" })),
    { name: "FixMate Admin", email: ADMIN_EMAIL, role: "customer" }, // promoted below
  ];
  for (const account of accounts) {
    console.log(`${account.email}: ${await signUp(account)}`);
  }

  // 2. Admin is created manually (never through public sign-up): promote in the database
  const users = getDB().collection("user");
  await users.updateOne({ email: ADMIN_EMAIL }, { $set: { role: "admin" } });

  // 3. Technician profile details
  for (const email of technicians.keys()) {
    const own = services.find((s) => s.technicianEmail === email);
    await users.updateOne(
      { email },
      {
        $set: {
          area: own?.serviceArea || "Dhaka",
          phone: "01700000000",
          bio: "Experienced repair technician. Quality parts, honest pricing and a warranty on every job.",
        },
      }
    );
  }

  // 4. Bookings in every status (re-running does not create duplicates)
  let paymentNo = 0;
  for (const [index, item] of PLAN.entries()) {
    const service = services[item.svc];
    const customer = CUSTOMERS[item.customer];
    const problem = PROBLEMS[index % PROBLEMS.length];
    const finalAmount = item.status === "completed" ? service.basePrice + (item.extra || 0) : service.basePrice;

    const booking = {
      serviceId: String(service._id),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: "01711111111",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
      preferredDate: new Date("2027-01-15"),
      problemDescription: problem,
      status: item.status,
      finalAmount,
      paymentStatus: item.paid ? "paid" : "unpaid",
      createdAt: new Date(),
    };

    await collections
      .bookings()
      .updateOne(
        { customerEmail: customer.email, serviceId: booking.serviceId, problemDescription: problem },
        { $setOnInsert: booking },
        { upsert: true }
      );

    // 5. Payment record for every paid booking
    if (item.paid) {
      paymentNo += 1;
      const saved = await collections
        .bookings()
        .findOne({ customerEmail: customer.email, serviceId: booking.serviceId, problemDescription: problem });
      await collections.payments().updateOne(
        { stripeSessionId: `cs_test_seed_${paymentNo}` },
        {
          $setOnInsert: {
            bookingId: String(saved._id),
            serviceTitle: service.title,
            customerName: customer.name,
            customerEmail: customer.email,
            technicianName: service.technicianName,
            technicianEmail: service.technicianEmail,
            amount: finalAmount,
            currency: "usd",
            transactionId: `pi_seed_${paymentNo}`,
            stripeSessionId: `cs_test_seed_${paymentNo}`,
            paymentStatus: "paid",
            paidAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  console.log("Seed finished.");
  console.log("Bookings:", await collections.bookings().countDocuments());
  console.log("Payments:", await collections.payments().countDocuments());
  console.log("Users:", await users.countDocuments());
  process.exit(0);
}

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});