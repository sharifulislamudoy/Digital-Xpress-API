import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import bannerRoutes from "./banner";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API working properly" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/banners", bannerRoutes);

export default router;