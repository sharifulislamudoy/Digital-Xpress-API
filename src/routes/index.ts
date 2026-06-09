import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API working properly" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);   // <-- add this line

export default router;