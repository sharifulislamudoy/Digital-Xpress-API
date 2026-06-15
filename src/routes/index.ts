import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import bannerRoutes from "./banner";
import productRoutes from "./products";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API working properly" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/banners", bannerRoutes);
router.use("/products", productRoutes);

export default router;
