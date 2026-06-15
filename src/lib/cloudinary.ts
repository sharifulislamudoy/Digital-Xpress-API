import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type UploadResult = {
  secure_url: string;
  public_id: string;
};

type ResourceType = "image" | "video";

function uploadBufferToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  resourceType: ResourceType
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        transformation:
          resourceType === "image"
            ? [
                {
                  quality: "auto",
                  fetch_format: "auto",
                },
              ]
            : undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary upload failed"));

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    Readable.from([fileBuffer]).pipe(uploadStream);
  });
}

// Backward compatible for your existing banner route.
export function uploadToCloudinary(
  fileBuffer: Buffer,
  folder = "digital-xpress/banners"
): Promise<UploadResult> {
  return uploadBufferToCloudinary(fileBuffer, folder, "image");
}

export function uploadImageToCloudinary(
  fileBuffer: Buffer,
  folder = "digital-xpress/products/images"
): Promise<UploadResult> {
  return uploadBufferToCloudinary(fileBuffer, folder, "image");
}

export function uploadVideoToCloudinary(
  fileBuffer: Buffer,
  folder = "digital-xpress/products/videos"
): Promise<UploadResult> {
  return uploadBufferToCloudinary(fileBuffer, folder, "video");
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: ResourceType = "image"
) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
