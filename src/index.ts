import "dotenv/config";

import express from "express";
import cors, { CorsOptions } from "cors";
import router from "./routes";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/", (_req, res) => {
  res.send({
    success: true,
    message: "Server is running",
  });
});

// Routes
app.use("/api/v1", router);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Start server
async function main() {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Allowed frontend origins:", allowedOrigins);
    });
  } catch (error) {
    console.log(error);
  }
}

main();