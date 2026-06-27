import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import bannerRoutes from "./banner";
import productRoutes from "./products";
import orderRoutes from "./orders";
import inventoryRoutes from "./inventory";
import reportRoutes from "./reports";
import reviewRoutes from "./reviews";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API working properly" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/banners", bannerRoutes);
router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/reports", reportRoutes);
router.use("/reviews", reviewRoutes);

export default router;
