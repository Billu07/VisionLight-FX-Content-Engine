import dotenv from "dotenv";
dotenv.config();

import express, { NextFunction, Request, Response } from "express";
import cors from "cors";

import superadminRouter from "./routes/superadmin";
import tenantRouter from "./routes/tenant";
import publicRouter from "./routes/public";
import appDataRouter from "./routes/app-data";
import mediaRouter from "./routes/media";

console.log("Environment Check:", {
  airtableKey: process.env.AIRTABLE_API_KEY ? "Loaded" : "Missing",
  airtableBase: process.env.AIRTABLE_BASE_ID ? "Loaded" : "Missing",
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "Loaded" : "Missing",
  openai: process.env.OPENAI_API_KEY ? "Loaded" : "Missing",
  google: process.env.GOOGLE_AI_API_KEY ? "Loaded" : "Missing",
  supabase: process.env.SUPABASE_URL ? "Loaded" : "Missing",
  r2AccountId: process.env.R2_ACCOUNT_ID ? "Loaded" : "Missing",
  r2Bucket: process.env.R2_BUCKET_NAME ? "Loaded" : "Missing",
});

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"],
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(publicRouter);
app.use("/api/superadmin", superadminRouter);
app.use("/api/tenant", tenantRouter);
app.use(appDataRouter);
app.use(mediaRouter);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error:", error);
  res.status(500).json({ error: "Internal Server Error" });
});

if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log(`SuperAdmin DELETE Org Route: ACTIVE`);
  });
}

export default app;
