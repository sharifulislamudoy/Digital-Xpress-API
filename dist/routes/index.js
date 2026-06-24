"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const users_1 = __importDefault(require("./users"));
const banner_1 = __importDefault(require("./banner"));
const products_1 = __importDefault(require("./products"));
const router = (0, express_1.Router)();
router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API working properly" });
});
router.use("/auth", auth_1.default);
router.use("/users", users_1.default);
router.use("/banners", banner_1.default);
router.use("/products", products_1.default);
exports.default = router;
