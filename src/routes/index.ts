import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "API working properly",
  });
});

export default router;