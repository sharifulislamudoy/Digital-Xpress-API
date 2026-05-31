import express from "express";
import cors from "cors";

import router from "./routes";

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", router);

app.get("/", (_req, res) => {
  res.send({
    success: true,
    message: "Server is running",
  });
});

export default app;