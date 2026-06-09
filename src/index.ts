import "dotenv/config";

import express from "express";
import cors from "cors";
import router from "./routes"; // Ensure this path matches your routes file

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/v1", router);

// Health check
app.get("/", (_req, res) => {
  res.send({
    success: true,
    message: "Server is running",
  });
});

// Start server
async function main() {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
}

main();