"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = uploadToCloudinary;
exports.uploadImageToCloudinary = uploadImageToCloudinary;
exports.uploadVideoToCloudinary = uploadVideoToCloudinary;
exports.deleteFromCloudinary = deleteFromCloudinary;
const stream_1 = require("stream");
const cloudinary_1 = require("cloudinary");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
function uploadBufferToCloudinary(fileBuffer, folder, resourceType) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            folder,
            resource_type: resourceType,
            transformation: resourceType === "image"
                ? [
                    {
                        quality: "auto",
                        fetch_format: "auto",
                    },
                ]
                : undefined,
        }, (error, result) => {
            if (error)
                return reject(error);
            if (!result)
                return reject(new Error("Cloudinary upload failed"));
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
            });
        });
        stream_1.Readable.from([fileBuffer]).pipe(uploadStream);
    });
}
// Backward compatible for your existing banner route.
function uploadToCloudinary(fileBuffer, folder = "digital-xpress/banners") {
    return uploadBufferToCloudinary(fileBuffer, folder, "image");
}
function uploadImageToCloudinary(fileBuffer, folder = "digital-xpress/products/images") {
    return uploadBufferToCloudinary(fileBuffer, folder, "image");
}
function uploadVideoToCloudinary(fileBuffer, folder = "digital-xpress/products/videos") {
    return uploadBufferToCloudinary(fileBuffer, folder, "video");
}
async function deleteFromCloudinary(publicId, resourceType = "image") {
    if (!publicId)
        return;
    await cloudinary_1.v2.uploader.destroy(publicId, { resource_type: resourceType });
}
