import {
  Prisma,
  PrismaClient,
  ProductType,
  StockStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

type SubCategorySeed = {
  name: string;
  slug: string;
  description: string;
};

type CategorySeed = {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  subCategories: SubCategorySeed[];
};

type BrandSeed = {
  name: string;
  slug: string;
};

type ProductSeed = {
  name: string;
  slug: string;
  sku: string;
  barcode?: string | null;
  modelName?: string | null;
  productType?: ProductType;

  categorySlug: string;
  subCategorySlug: string;
  brandSlug: string;

  shortDescription: string;
  description: string;
  keyFeatures: string[];
  highlights: string[];
  specifications: Prisma.InputJsonValue;
  tags: string[];
  searchKeywords: string[];

  mrp: number;
  costPrice: number;
  sellingPrice: number;

  stock: number;
  stockStatus?: StockStatus;
  lowStockAlertQuantity?: number;

  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  isRecommended?: boolean;
  isFlashSale?: boolean;

  warrantyDuration?: string | null;
  warrantyDetails?: string | null;
  returnPolicy?: string | null;
  replacementPolicy?: string | null;
  refundPolicy?: string | null;

  deliveryInfo?: string | null;
  deliveryTime?: string | null;
  cashOnDelivery?: boolean;
  freeDelivery?: boolean;

  packageIncludes: string[];
  packageWeight?: string | null;
  packageDimensions?: string | null;
};

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function productImage(text: string) {
  return `https://placehold.co/1000x1000/111827/f97316.png?text=${encodeURIComponent(
    text,
  )}`;
}

function categoryImage(text: string) {
  return `https://placehold.co/1200x600/111827/f97316.png?text=${encodeURIComponent(
    text,
  )}`;
}

function logoImage(text: string) {
  return `https://placehold.co/500x500/111827/f97316.png?text=${encodeURIComponent(
    text,
  )}`;
}

function publicId(slug: string, type: string) {
  return `digital-xpress/seed/products/${slug}/${type}`;
}

function canAddToCart(stockStatus: StockStatus) {
  return (
    stockStatus !== StockStatus.OUT_OF_STOCK &&
    stockStatus !== StockStatus.COMING_SOON
  );
}

const categories: CategorySeed[] = [
  {
    name: "Mobile Phones",
    slug: "mobile-phones",
    description: "Official smartphones, feature phones, and gaming phones.",
    sortOrder: 1,
    subCategories: [
      {
        name: "Smartphones",
        slug: "smartphones",
        description: "Latest Android and iOS smartphones.",
      },
      {
        name: "Official Phones",
        slug: "official-phones",
        description: "Brand official warranty smartphones.",
      },
      {
        name: "Gaming Phones",
        slug: "gaming-phones",
        description: "Performance focused smartphones for gaming.",
      },
      {
        name: "Feature Phones",
        slug: "feature-phones",
        description: "Basic phones for calling and long battery backup.",
      },
      {
        name: "Used Phones",
        slug: "used-phones",
        description: "Checked and verified pre-owned phones.",
      },
    ],
  },
  {
    name: "Mobile Accessories",
    slug: "mobile-accessories",
    description: "Chargers, cables, power banks, cases and protectors.",
    sortOrder: 2,
    subCategories: [
      {
        name: "Chargers",
        slug: "chargers",
        description: "Fast chargers and adapter collections.",
      },
      {
        name: "Cables",
        slug: "cables",
        description: "USB-C, Lightning and data cables.",
      },
      {
        name: "Power Banks",
        slug: "power-banks",
        description: "Portable backup power for daily use.",
      },
      {
        name: "Cases & Covers",
        slug: "cases-covers",
        description: "Protective cases and stylish covers.",
      },
      {
        name: "Screen Protectors",
        slug: "screen-protectors",
        description: "Tempered glass and screen safety accessories.",
      },
    ],
  },
  {
    name: "Computers & Laptops",
    slug: "computers-laptops",
    description: "Laptops, desktops, MacBook and gaming computers.",
    sortOrder: 3,
    subCategories: [
      {
        name: "Laptops",
        slug: "laptops",
        description: "Daily work, study and business laptops.",
      },
      {
        name: "Gaming Laptops",
        slug: "gaming-laptops",
        description: "Powerful laptops for gaming and creative work.",
      },
      {
        name: "MacBook",
        slug: "macbook",
        description: "Apple MacBook Air and MacBook Pro devices.",
      },
      {
        name: "Desktop PCs",
        slug: "desktop-pcs",
        description: "Desktop computers and custom PC setups.",
      },
      {
        name: "Monitors",
        slug: "monitors",
        description: "Office, gaming and creator monitors.",
      },
    ],
  },
  {
    name: "Computer Accessories",
    slug: "computer-accessories",
    description: "Keyboard, mouse, webcam, storage and laptop accessories.",
    sortOrder: 4,
    subCategories: [
      {
        name: "Keyboard",
        slug: "keyboard",
        description: "Mechanical and office keyboards.",
      },
      {
        name: "Mouse",
        slug: "mouse",
        description: "Wireless, gaming and productivity mouse.",
      },
      {
        name: "Storage",
        slug: "storage",
        description: "SSD, HDD, pen drive and memory cards.",
      },
      {
        name: "Webcams",
        slug: "webcams",
        description: "Web cameras for meetings and streaming.",
      },
      {
        name: "Laptop Stands",
        slug: "laptop-stands",
        description: "Portable stands for better desk setup.",
      },
    ],
  },
  {
    name: "Audio & Wearables",
    slug: "audio-wearables",
    description: "Headphones, earbuds, smart watches and speakers.",
    sortOrder: 5,
    subCategories: [
      {
        name: "Headphones",
        slug: "headphones",
        description: "Over-ear and wireless headphones.",
      },
      {
        name: "Earbuds",
        slug: "earbuds",
        description: "True wireless earbuds for daily use.",
      },
      {
        name: "Smart Watches",
        slug: "smart-watches",
        description: "Fitness and smart notification watches.",
      },
      {
        name: "Speakers",
        slug: "speakers",
        description: "Portable and desktop speakers.",
      },
      {
        name: "Microphones",
        slug: "microphones",
        description: "USB and studio microphones.",
      },
    ],
  },
  {
    name: "Gaming & Networking",
    slug: "gaming-networking",
    description: "Gaming accessories, routers, cameras and smart gadgets.",
    sortOrder: 6,
    subCategories: [
      {
        name: "Game Controllers",
        slug: "game-controllers",
        description: "Controllers and gamepads for console and PC.",
      },
      {
        name: "Consoles",
        slug: "consoles",
        description: "Gaming consoles and related devices.",
      },
      {
        name: "Routers",
        slug: "routers",
        description: "WiFi routers and networking devices.",
      },
      {
        name: "Security Cameras",
        slug: "security-cameras",
        description: "Smart cameras and home security devices.",
      },
      {
        name: "Smart Gadgets",
        slug: "smart-gadgets",
        description: "Useful smart home and lifestyle gadgets.",
      },
    ],
  },
];

const brands: BrandSeed[] = [
  { name: "Apple", slug: "apple" },
  { name: "Samsung", slug: "samsung" },
  { name: "Xiaomi", slug: "xiaomi" },
  { name: "Anker", slug: "anker" },
  { name: "Baseus", slug: "baseus" },
  { name: "UGREEN", slug: "ugreen" },
  { name: "ASUS", slug: "asus" },
  { name: "Logitech", slug: "logitech" },
  { name: "Redragon", slug: "redragon" },
  { name: "Sony", slug: "sony" },
  { name: "Amazfit", slug: "amazfit" },
  { name: "TP-Link", slug: "tp-link" },
];

const products: ProductSeed[] = [
  {
    name: "Apple iPhone 15 128GB",
    slug: "apple-iphone-15-128gb",
    sku: "DX-MOB-0001",
    modelName: "iPhone 15",
    categorySlug: "mobile-phones",
    subCategorySlug: "smartphones",
    brandSlug: "apple",
    shortDescription: "Official Apple iPhone 15 with 128GB storage.",
    description:
      "Apple iPhone 15 comes with a Super Retina XDR display, A16 Bionic chip, Dynamic Island, excellent camera performance and reliable battery backup.",
    keyFeatures: [
      "6.1-inch Super Retina XDR display",
      "A16 Bionic chip",
      "48MP main camera",
      "128GB storage",
      "USB-C charging",
    ],
    highlights: ["Dynamic Island", "Official quality", "Excellent camera"],
    specifications: {
      display: "6.1-inch OLED",
      processor: "A16 Bionic",
      storage: "128GB",
      camera: "48MP + 12MP",
      battery: "All-day battery life",
      charging: "USB-C",
    },
    tags: ["iphone", "apple", "smartphone"],
    searchKeywords: ["iphone 15", "apple phone", "ios phone"],
    mrp: 112000,
    costPrice: 97000,
    sellingPrice: 104999,
    stock: 12,
    stockStatus: StockStatus.IN_STOCK,
    lowStockAlertQuantity: 3,
    isFeatured: true,
    isNewArrival: true,
    isRecommended: true,
    warrantyDuration: "12 months",
    warrantyDetails: "Official service warranty where applicable.",
    returnPolicy: "Return accepted only for manufacturing defects.",
    replacementPolicy: "Replacement available within 3 days for valid issues.",
    refundPolicy: "Refund processed after product inspection.",
    deliveryInfo: "Inside Dhaka and outside Dhaka delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: true,
    packageIncludes: ["Phone", "USB-C cable", "Documentation"],
    packageWeight: "0.35 kg",
    packageDimensions: "18 x 10 x 5 cm",
  },
  {
    name: "Samsung Galaxy S24 Ultra 256GB",
    slug: "samsung-galaxy-s24-ultra-256gb",
    sku: "DX-MOB-0002",
    modelName: "Galaxy S24 Ultra",
    categorySlug: "mobile-phones",
    subCategorySlug: "smartphones",
    brandSlug: "samsung",
    shortDescription: "Premium Samsung flagship with S Pen and AI features.",
    description:
      "Samsung Galaxy S24 Ultra is a premium flagship smartphone with a bright AMOLED display, powerful processor, S Pen support and advanced camera system.",
    keyFeatures: [
      "6.8-inch Dynamic AMOLED display",
      "Snapdragon flagship processor",
      "200MP main camera",
      "Built-in S Pen",
      "256GB storage",
    ],
    highlights: ["S Pen support", "AI features", "Flagship camera"],
    specifications: {
      display: "6.8-inch Dynamic AMOLED 2X",
      processor: "Snapdragon 8 Gen series",
      storage: "256GB",
      camera: "200MP quad camera",
      battery: "5000mAh",
      charging: "Fast charging",
    },
    tags: ["samsung", "android", "flagship"],
    searchKeywords: ["s24 ultra", "samsung phone", "android flagship"],
    mrp: 165000,
    costPrice: 145000,
    sellingPrice: 154999,
    stock: 8,
    stockStatus: StockStatus.LIMITED_STOCK,
    lowStockAlertQuantity: 2,
    isFeatured: true,
    isBestSeller: true,
    isTrending: true,
    warrantyDuration: "12 months",
    warrantyDetails: "Brand warranty where applicable.",
    returnPolicy: "Return accepted only for manufacturing defects.",
    replacementPolicy: "Replacement available within 3 days for valid issues.",
    refundPolicy: "Refund processed after product inspection.",
    deliveryInfo: "Secured delivery available nationwide.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: true,
    packageIncludes: ["Phone", "Cable", "SIM ejector", "Documentation"],
    packageWeight: "0.45 kg",
    packageDimensions: "19 x 10 x 6 cm",
  },
  {
    name: "Xiaomi Redmi Note 13 Pro 5G 256GB",
    slug: "xiaomi-redmi-note-13-pro-5g-256gb",
    sku: "DX-MOB-0003",
    modelName: "Redmi Note 13 Pro 5G",
    categorySlug: "mobile-phones",
    subCategorySlug: "smartphones",
    brandSlug: "xiaomi",
    shortDescription: "Value-for-money 5G phone with AMOLED display.",
    description:
      "Redmi Note 13 Pro 5G offers a smooth AMOLED display, strong battery backup, fast charging and a sharp camera setup at a competitive price.",
    keyFeatures: [
      "AMOLED display",
      "5G network support",
      "Fast charging",
      "Large battery",
      "256GB storage",
    ],
    highlights: ["Budget flagship feel", "Fast charging", "Large storage"],
    specifications: {
      display: "AMOLED high refresh display",
      network: "5G",
      storage: "256GB",
      camera: "High resolution main camera",
      battery: "Large capacity battery",
    },
    tags: ["xiaomi", "redmi", "5g"],
    searchKeywords: ["redmi note 13 pro", "xiaomi 5g phone"],
    mrp: 41000,
    costPrice: 34000,
    sellingPrice: 37999,
    stock: 20,
    stockStatus: StockStatus.IN_STOCK,
    isBestSeller: true,
    isRecommended: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted only for manufacturing defects.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-4 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Phone", "Charger", "Cable", "Case"],
    packageWeight: "0.45 kg",
    packageDimensions: "18 x 10 x 6 cm",
  },
  {
    name: "Anker Nano 20W USB-C Charger",
    slug: "anker-nano-20w-usb-c-charger",
    sku: "DX-ACC-0001",
    modelName: "Nano 20W",
    categorySlug: "mobile-accessories",
    subCategorySlug: "chargers",
    brandSlug: "anker",
    shortDescription: "Compact 20W fast charger for phones and accessories.",
    description:
      "Anker Nano 20W USB-C Charger is compact, travel-friendly and suitable for fast charging supported smartphones and accessories.",
    keyFeatures: [
      "20W USB-C output",
      "Compact design",
      "Fast charging support",
      "Travel friendly",
    ],
    highlights: ["Compact size", "Fast charging", "Reliable build"],
    specifications: {
      output: "20W",
      port: "USB-C",
      compatibility: "iPhone, Android, earbuds and accessories",
      protection: "Over-voltage and temperature protection",
    },
    tags: ["charger", "anker", "usb-c"],
    searchKeywords: ["anker charger", "20w charger", "type c charger"],
    mrp: 2200,
    costPrice: 1450,
    sellingPrice: 1799,
    stock: 45,
    stockStatus: StockStatus.IN_STOCK,
    isBestSeller: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Small parcel delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Charger adapter"],
    packageWeight: "0.10 kg",
    packageDimensions: "8 x 6 x 4 cm",
  },
  {
    name: "Baseus Cafule Type-C Cable 100W",
    slug: "baseus-cafule-type-c-cable-100w",
    sku: "DX-ACC-0002",
    modelName: "Cafule 100W",
    categorySlug: "mobile-accessories",
    subCategorySlug: "cables",
    brandSlug: "baseus",
    shortDescription: "Durable Type-C cable with up to 100W charging support.",
    description:
      "Baseus Cafule Type-C Cable supports fast charging, stable data transfer and comes with durable braided protection for long-term use.",
    keyFeatures: [
      "100W fast charging",
      "Braided cable",
      "Type-C to Type-C",
      "Data transfer support",
    ],
    highlights: ["Durable braided body", "Fast charging", "Daily use ready"],
    specifications: {
      type: "USB-C to USB-C",
      power: "Up to 100W",
      length: "1 meter",
      material: "Braided nylon",
    },
    tags: ["cable", "baseus", "type-c"],
    searchKeywords: ["baseus cable", "100w cable", "type c cable"],
    mrp: 950,
    costPrice: 520,
    sellingPrice: 749,
    stock: 80,
    stockStatus: StockStatus.IN_STOCK,
    isRecommended: true,
    warrantyDuration: "3 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Type-C cable"],
    packageWeight: "0.08 kg",
    packageDimensions: "12 x 8 x 2 cm",
  },
  {
    name: "UGREEN 20000mAh Fast Charging Power Bank",
    slug: "ugreen-20000mah-fast-charging-power-bank",
    sku: "DX-ACC-0003",
    modelName: "20000mAh Power Bank",
    categorySlug: "mobile-accessories",
    subCategorySlug: "power-banks",
    brandSlug: "ugreen",
    shortDescription: "High capacity power bank for phones and accessories.",
    description:
      "UGREEN 20000mAh Power Bank offers reliable backup power, fast charging support and multiple safety protections for daily travel.",
    keyFeatures: [
      "20000mAh capacity",
      "Fast charging support",
      "Multiple output ports",
      "Safety protection",
    ],
    highlights: ["High capacity", "Travel ready", "Multiple devices"],
    specifications: {
      capacity: "20000mAh",
      input: "USB-C",
      output: "USB-A and USB-C",
      protection: "Short circuit and temperature protection",
    },
    tags: ["power bank", "ugreen", "fast charging"],
    searchKeywords: ["ugreen power bank", "20000mah power bank"],
    mrp: 4200,
    costPrice: 3100,
    sellingPrice: 3599,
    stock: 25,
    stockStatus: StockStatus.IN_STOCK,
    isFeatured: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-4 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Power bank", "Charging cable", "Manual"],
    packageWeight: "0.45 kg",
    packageDimensions: "16 x 8 x 4 cm",
  },
  {
    name: "Apple MacBook Air 13-inch M3 256GB",
    slug: "apple-macbook-air-13-inch-m3-256gb",
    sku: "DX-LAP-0001",
    modelName: "MacBook Air M3",
    categorySlug: "computers-laptops",
    subCategorySlug: "macbook",
    brandSlug: "apple",
    shortDescription: "Slim MacBook Air with Apple M3 chip.",
    description:
      "MacBook Air M3 is lightweight, silent and powerful enough for study, office work, development and daily productivity.",
    keyFeatures: [
      "Apple M3 chip",
      "13-inch Liquid Retina display",
      "8GB unified memory",
      "256GB SSD",
      "Lightweight design",
    ],
    highlights: ["M3 performance", "Long battery life", "Premium build"],
    specifications: {
      processor: "Apple M3",
      memory: "8GB unified memory",
      storage: "256GB SSD",
      display: "13-inch Liquid Retina",
      os: "macOS",
    },
    tags: ["macbook", "apple laptop", "m3"],
    searchKeywords: ["macbook air m3", "apple laptop", "macbook 13"],
    mrp: 145000,
    costPrice: 128000,
    sellingPrice: 136999,
    stock: 6,
    stockStatus: StockStatus.LIMITED_STOCK,
    lowStockAlertQuantity: 2,
    isFeatured: true,
    isNewArrival: true,
    warrantyDuration: "12 months",
    warrantyDetails: "International or seller warranty depending on stock.",
    returnPolicy: "Return accepted only for manufacturing defects.",
    replacementPolicy: "Replacement available within 3 days for valid issues.",
    refundPolicy: "Refund processed after product inspection.",
    deliveryInfo: "Secured laptop delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: false,
    freeDelivery: true,
    packageIncludes: ["MacBook Air", "USB-C power adapter", "USB-C cable"],
    packageWeight: "1.8 kg",
    packageDimensions: "36 x 26 x 8 cm",
  },
  {
    name: "ASUS TUF Gaming A15 Ryzen 7 RTX 4060",
    slug: "asus-tuf-gaming-a15-ryzen-7-rtx-4060",
    sku: "DX-LAP-0002",
    modelName: "TUF Gaming A15",
    categorySlug: "computers-laptops",
    subCategorySlug: "gaming-laptops",
    brandSlug: "asus",
    shortDescription: "Gaming laptop with Ryzen 7 and RTX 4060 graphics.",
    description:
      "ASUS TUF Gaming A15 is built for gaming, graphics work and heavy multitasking with powerful AMD Ryzen processor and NVIDIA RTX graphics.",
    keyFeatures: [
      "AMD Ryzen 7 processor",
      "NVIDIA RTX 4060 GPU",
      "144Hz display",
      "16GB RAM",
      "512GB SSD",
    ],
    highlights: ["RTX graphics", "Gaming ready", "High refresh display"],
    specifications: {
      processor: "AMD Ryzen 7",
      graphics: "NVIDIA RTX 4060",
      memory: "16GB RAM",
      storage: "512GB SSD",
      display: "15.6-inch 144Hz",
    },
    tags: ["asus", "gaming laptop", "rtx"],
    searchKeywords: ["asus tuf a15", "rtx 4060 laptop", "gaming laptop"],
    mrp: 168000,
    costPrice: 148000,
    sellingPrice: 157999,
    stock: 5,
    stockStatus: StockStatus.LOW_STOCK,
    lowStockAlertQuantity: 2,
    isTrending: true,
    isFeatured: true,
    warrantyDuration: "12 months",
    warrantyDetails: "Brand or seller warranty depending on stock.",
    returnPolicy: "Return accepted only for manufacturing defects.",
    replacementPolicy: "Replacement available within 3 days for valid issues.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Secured laptop delivery available.",
    deliveryTime: "1-4 business days",
    cashOnDelivery: false,
    freeDelivery: true,
    packageIncludes: ["Laptop", "Power adapter", "Documentation"],
    packageWeight: "3.0 kg",
    packageDimensions: "42 x 32 x 10 cm",
  },
  {
    name: "Logitech MX Master 3S Wireless Mouse",
    slug: "logitech-mx-master-3s-wireless-mouse",
    sku: "DX-COM-0001",
    modelName: "MX Master 3S",
    categorySlug: "computer-accessories",
    subCategorySlug: "mouse",
    brandSlug: "logitech",
    shortDescription: "Premium wireless mouse for productivity and creators.",
    description:
      "Logitech MX Master 3S offers quiet clicks, ergonomic grip, precise scrolling and multi-device workflow support.",
    keyFeatures: [
      "Wireless connectivity",
      "Quiet clicks",
      "Ergonomic design",
      "Multi-device support",
      "Fast scrolling wheel",
    ],
    highlights: ["Productivity mouse", "Comfortable grip", "Premium feel"],
    specifications: {
      connectivity: "Bluetooth and USB receiver",
      battery: "Rechargeable",
      sensor: "High precision sensor",
      compatibility: "Windows, macOS, Linux",
    },
    tags: ["mouse", "logitech", "wireless mouse"],
    searchKeywords: ["mx master 3s", "logitech mouse", "wireless mouse"],
    mrp: 12500,
    costPrice: 9300,
    sellingPrice: 10999,
    stock: 14,
    stockStatus: StockStatus.IN_STOCK,
    isRecommended: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Mouse", "USB receiver", "Charging cable"],
    packageWeight: "0.25 kg",
    packageDimensions: "14 x 10 x 6 cm",
  },
  {
    name: "Redragon K617 Fizz RGB Mechanical Keyboard",
    slug: "redragon-k617-fizz-rgb-mechanical-keyboard",
    sku: "DX-COM-0002",
    modelName: "K617 Fizz",
    categorySlug: "computer-accessories",
    subCategorySlug: "keyboard",
    brandSlug: "redragon",
    shortDescription: "Compact RGB mechanical keyboard for gaming and typing.",
    description:
      "Redragon K617 Fizz is a compact mechanical keyboard with RGB lighting, responsive switches and a desk-friendly layout.",
    keyFeatures: [
      "Compact layout",
      "RGB lighting",
      "Mechanical switches",
      "Detachable cable",
    ],
    highlights: ["RGB setup", "Compact size", "Gaming friendly"],
    specifications: {
      layout: "60 percent compact",
      switch: "Mechanical switch",
      lighting: "RGB",
      connection: "Wired USB-C",
    },
    tags: ["keyboard", "redragon", "mechanical keyboard"],
    searchKeywords: ["redragon k617", "rgb keyboard", "mechanical keyboard"],
    mrp: 4300,
    costPrice: 2950,
    sellingPrice: 3499,
    stock: 28,
    stockStatus: StockStatus.IN_STOCK,
    isBestSeller: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Keyboard", "USB-C cable", "Keycap puller"],
    packageWeight: "0.75 kg",
    packageDimensions: "34 x 14 x 5 cm",
  },
  {
    name: "Sony WH-1000XM5 Wireless Headphone",
    slug: "sony-wh-1000xm5-wireless-headphone",
    sku: "DX-AUD-0001",
    modelName: "WH-1000XM5",
    categorySlug: "audio-wearables",
    subCategorySlug: "headphones",
    brandSlug: "sony",
    shortDescription: "Premium noise cancelling wireless headphone.",
    description:
      "Sony WH-1000XM5 delivers excellent noise cancellation, premium comfort, clear calls and long battery backup.",
    keyFeatures: [
      "Active noise cancellation",
      "Wireless Bluetooth",
      "Long battery life",
      "Comfortable earcups",
      "Clear call quality",
    ],
    highlights: ["Best-in-class ANC", "Premium audio", "Travel friendly"],
    specifications: {
      connection: "Bluetooth",
      battery: "Up to 30 hours",
      noiseCancellation: "Active noise cancellation",
      charging: "USB-C",
    },
    tags: ["sony", "headphone", "anc"],
    searchKeywords: [
      "sony xm5",
      "noise cancelling headphone",
      "wireless headphone",
    ],
    mrp: 42000,
    costPrice: 33500,
    sellingPrice: 37999,
    stock: 9,
    stockStatus: StockStatus.LIMITED_STOCK,
    isFeatured: true,
    isTrending: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-4 business days",
    cashOnDelivery: true,
    freeDelivery: true,
    packageIncludes: ["Headphone", "Carry case", "Charging cable"],
    packageWeight: "0.65 kg",
    packageDimensions: "24 x 20 x 8 cm",
  },
  {
    name: "Apple AirPods Pro 2nd Gen USB-C",
    slug: "apple-airpods-pro-2nd-gen-usb-c",
    sku: "DX-AUD-0002",
    modelName: "AirPods Pro 2 USB-C",
    categorySlug: "audio-wearables",
    subCategorySlug: "earbuds",
    brandSlug: "apple",
    shortDescription: "Apple earbuds with ANC and USB-C charging case.",
    description:
      "AirPods Pro 2nd Gen offers active noise cancellation, transparency mode, spatial audio and USB-C charging case.",
    keyFeatures: [
      "Active noise cancellation",
      "Transparency mode",
      "Spatial audio",
      "USB-C charging case",
    ],
    highlights: ["ANC earbuds", "Apple ecosystem", "USB-C case"],
    specifications: {
      connection: "Bluetooth",
      chargingCase: "USB-C",
      noiseCancellation: "Active noise cancellation",
      audio: "Spatial audio support",
    },
    tags: ["airpods", "apple earbuds", "anc earbuds"],
    searchKeywords: ["airpods pro 2", "apple earbuds", "usb c airpods"],
    mrp: 31500,
    costPrice: 25500,
    sellingPrice: 28999,
    stock: 18,
    stockStatus: StockStatus.IN_STOCK,
    isBestSeller: true,
    isRecommended: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: true,
    packageIncludes: ["Earbuds", "Charging case", "USB-C cable", "Ear tips"],
    packageWeight: "0.20 kg",
    packageDimensions: "12 x 10 x 5 cm",
  },
  {
    name: "Amazfit GTR 4 Smart Watch",
    slug: "amazfit-gtr-4-smart-watch",
    sku: "DX-WEA-0001",
    modelName: "GTR 4",
    categorySlug: "audio-wearables",
    subCategorySlug: "smart-watches",
    brandSlug: "amazfit",
    shortDescription: "Stylish smartwatch with fitness tracking and GPS.",
    description:
      "Amazfit GTR 4 is a stylish smartwatch with AMOLED display, fitness tracking, GPS and long battery backup.",
    keyFeatures: [
      "AMOLED display",
      "Fitness tracking",
      "Built-in GPS",
      "Long battery backup",
      "Bluetooth calling support",
    ],
    highlights: ["Fitness focused", "Stylish design", "Long battery"],
    specifications: {
      display: "AMOLED",
      gps: "Built-in GPS",
      health: "Heart rate and SpO2 tracking",
      battery: "Long battery backup",
    },
    tags: ["amazfit", "smart watch", "wearable"],
    searchKeywords: ["amazfit gtr 4", "smart watch", "fitness watch"],
    mrp: 18500,
    costPrice: 13500,
    sellingPrice: 15999,
    stock: 17,
    stockStatus: StockStatus.IN_STOCK,
    isNewArrival: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Smart watch", "Charging dock", "Manual"],
    packageWeight: "0.25 kg",
    packageDimensions: "12 x 10 x 6 cm",
  },
  {
    name: "Sony DualSense Wireless Controller",
    slug: "sony-dualsense-wireless-controller",
    sku: "DX-GAM-0001",
    modelName: "DualSense",
    categorySlug: "gaming-networking",
    subCategorySlug: "game-controllers",
    brandSlug: "sony",
    shortDescription:
      "Wireless controller for PlayStation and supported PC games.",
    description:
      "Sony DualSense Wireless Controller delivers comfortable grip, adaptive triggers, haptic feedback and responsive controls.",
    keyFeatures: [
      "Wireless controller",
      "Haptic feedback",
      "Adaptive triggers",
      "Built-in microphone",
      "USB-C charging",
    ],
    highlights: ["Console quality", "Haptic feedback", "Comfortable design"],
    specifications: {
      connection: "Bluetooth and USB-C",
      compatibility: "PlayStation and supported PC games",
      charging: "USB-C",
      features: "Haptic feedback and adaptive triggers",
    },
    tags: ["controller", "dualsense", "gaming"],
    searchKeywords: [
      "dualsense controller",
      "ps5 controller",
      "game controller",
    ],
    mrp: 9500,
    costPrice: 7000,
    sellingPrice: 8299,
    stock: 21,
    stockStatus: StockStatus.IN_STOCK,
    isTrending: true,
    warrantyDuration: "3 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Controller", "Documentation"],
    packageWeight: "0.45 kg",
    packageDimensions: "18 x 16 x 8 cm",
  },
  {
    name: "TP-Link Archer AX23 WiFi 6 Router",
    slug: "tp-link-archer-ax23-wifi-6-router",
    sku: "DX-NET-0001",
    modelName: "Archer AX23",
    categorySlug: "gaming-networking",
    subCategorySlug: "routers",
    brandSlug: "tp-link",
    shortDescription: "WiFi 6 router for faster home and office network.",
    description:
      "TP-Link Archer AX23 WiFi 6 Router provides faster wireless speed, better coverage and stable connection for home or office use.",
    keyFeatures: [
      "WiFi 6 support",
      "Dual-band connection",
      "High speed wireless",
      "Multiple antennas",
      "Easy setup",
    ],
    highlights: ["WiFi 6", "Stable connection", "Better coverage"],
    specifications: {
      wireless: "WiFi 6",
      bands: "Dual-band",
      usage: "Home and office",
      ports: "Gigabit Ethernet ports",
    },
    tags: ["router", "tp-link", "wifi 6"],
    searchKeywords: ["tp link router", "wifi 6 router", "archer ax23"],
    mrp: 6500,
    costPrice: 4700,
    sellingPrice: 5599,
    stock: 16,
    stockStatus: StockStatus.IN_STOCK,
    isRecommended: true,
    warrantyDuration: "12 months",
    warrantyDetails: "Brand or seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Router", "Power adapter", "LAN cable", "Manual"],
    packageWeight: "0.65 kg",
    packageDimensions: "28 x 18 x 8 cm",
  },
  {
    name: "Xiaomi Smart Camera C300",
    slug: "xiaomi-smart-camera-c300",
    sku: "DX-SEC-0001",
    modelName: "Smart Camera C300",
    categorySlug: "gaming-networking",
    subCategorySlug: "security-cameras",
    brandSlug: "xiaomi",
    shortDescription: "Smart security camera for home and office monitoring.",
    description:
      "Xiaomi Smart Camera C300 offers clear video monitoring, night vision, two-way audio and smart home app control.",
    keyFeatures: [
      "Clear video recording",
      "Night vision",
      "Two-way audio",
      "App control",
      "Motion detection",
    ],
    highlights: ["Home security", "Smart app control", "Night vision"],
    specifications: {
      resolution: "2K style clear video",
      audio: "Two-way audio",
      nightVision: "Supported",
      storage: "Memory card and supported cloud option",
    },
    tags: ["camera", "security camera", "xiaomi"],
    searchKeywords: ["xiaomi camera", "smart camera", "security camera"],
    mrp: 5200,
    costPrice: 3650,
    sellingPrice: 4399,
    stock: 22,
    stockStatus: StockStatus.IN_STOCK,
    isNewArrival: true,
    warrantyDuration: "6 months",
    warrantyDetails: "Seller warranty.",
    returnPolicy: "Return accepted for defective products only.",
    replacementPolicy: "Replacement available within 3 days.",
    refundPolicy: "Refund processed after inspection.",
    deliveryInfo: "Nationwide delivery available.",
    deliveryTime: "1-3 business days",
    cashOnDelivery: true,
    freeDelivery: false,
    packageIncludes: ["Camera", "Power cable", "Mounting kit", "Manual"],
    packageWeight: "0.35 kg",
    packageDimensions: "15 x 12 x 8 cm",
  },
];

async function seedCategories() {
  const categoryMap = new Map<string, string>();
  const subCategoryMap = new Map<string, string>();

  for (const categoryItem of categories) {
    const category = await prisma.productCategory.upsert({
      where: { slug: categoryItem.slug },
      update: {
        name: categoryItem.name,
        description: categoryItem.description,
        imageUrl: categoryImage(categoryItem.name),
        iconSvg: null,
        sortOrder: categoryItem.sortOrder,
        isPublished: true,
        seoTitle: `${categoryItem.name} | Digital Xpress`,
        seoDescription: categoryItem.description,
        seoKeywords: [
          categoryItem.name.toLowerCase(),
          "digital xpress",
          "bangladesh",
        ],
      },
      create: {
        name: categoryItem.name,
        slug: categoryItem.slug,
        description: categoryItem.description,
        imageUrl: categoryImage(categoryItem.name),
        iconSvg: null,
        sortOrder: categoryItem.sortOrder,
        isPublished: true,
        seoTitle: `${categoryItem.name} | Digital Xpress`,
        seoDescription: categoryItem.description,
        seoKeywords: [
          categoryItem.name.toLowerCase(),
          "digital xpress",
          "bangladesh",
        ],
      },
    });

    categoryMap.set(categoryItem.slug, category.id);

    for (let index = 0; index < categoryItem.subCategories.length; index++) {
      const subCategoryItem = categoryItem.subCategories[index];

      const subCategory = await prisma.productSubCategory.upsert({
        where: {
          categoryId_slug: {
            categoryId: category.id,
            slug: subCategoryItem.slug,
          },
        },
        update: {
          name: subCategoryItem.name,
          description: subCategoryItem.description,
          imageUrl: categoryImage(subCategoryItem.name),
          iconSvg: null,
          sortOrder: index + 1,
          isPublished: true,
          seoTitle: `${subCategoryItem.name} | Digital Xpress`,
          seoDescription: subCategoryItem.description,
          seoKeywords: [
            subCategoryItem.name.toLowerCase(),
            categoryItem.name.toLowerCase(),
            "digital xpress",
          ],
        },
        create: {
          name: subCategoryItem.name,
          slug: subCategoryItem.slug,
          categoryId: category.id,
          description: subCategoryItem.description,
          imageUrl: categoryImage(subCategoryItem.name),
          iconSvg: null,
          sortOrder: index + 1,
          isPublished: true,
          seoTitle: `${subCategoryItem.name} | Digital Xpress`,
          seoDescription: subCategoryItem.description,
          seoKeywords: [
            subCategoryItem.name.toLowerCase(),
            categoryItem.name.toLowerCase(),
            "digital xpress",
          ],
        },
      });

      subCategoryMap.set(
        `${categoryItem.slug}:${subCategoryItem.slug}`,
        subCategory.id,
      );
    }
  }

  return { categoryMap, subCategoryMap };
}

async function seedBrands() {
  const brandMap = new Map<string, string>();

  for (const brandItem of brands) {
    const brand = await prisma.brand.upsert({
      where: { slug: brandItem.slug },
      update: {
        name: brandItem.name,
        logoUrl: logoImage(brandItem.name),
        seoTitle: `${brandItem.name} Products | Digital Xpress`,
        seoDescription: `Buy ${brandItem.name} products from Digital Xpress.`,
        seoKeywords: [brandItem.name.toLowerCase(), "digital xpress"],
      },
      create: {
        name: brandItem.name,
        slug: brandItem.slug,
        logoUrl: logoImage(brandItem.name),
        seoTitle: `${brandItem.name} Products | Digital Xpress`,
        seoDescription: `Buy ${brandItem.name} products from Digital Xpress.`,
        seoKeywords: [brandItem.name.toLowerCase(), "digital xpress"],
      },
    });

    brandMap.set(brandItem.slug, brand.id);
  }

  return brandMap;
}

function buildExtraImages(product: ProductSeed) {
  return [
    {
      imageUrl: productImage(`${product.name} Front`),
      cloudinaryPublicId: publicId(product.slug, "extra-1"),
      altText: `${product.name} front view`,
      sortOrder: 1,
    },
    {
      imageUrl: productImage(`${product.name} Details`),
      cloudinaryPublicId: publicId(product.slug, "extra-2"),
      altText: `${product.name} details view`,
      sortOrder: 2,
    },
  ];
}

function buildCommonProductData(product: ProductSeed) {
  const stockStatus = product.stockStatus ?? StockStatus.IN_STOCK;
  const costPrice = money(product.costPrice);
  const stockValue = money(product.costPrice * product.stock);

  return {
    name: product.name,
    slug: product.slug,

    productType: product.productType ?? ProductType.single,

    sku: product.sku,
    barcode: product.barcode ?? null,
    modelName: product.modelName ?? null,

    shortDescription: product.shortDescription,
    description: product.description,

    keyFeatures: product.keyFeatures,
    highlights: product.highlights,
    specifications: product.specifications,

    tags: product.tags,
    searchKeywords: product.searchKeywords,

    mrp: money(product.mrp),
    costPrice,
    sellingPrice: money(product.sellingPrice),

    stock: product.stock,
    stockStatus,
    lowStockAlertQuantity: product.lowStockAlertQuantity ?? 5,

    inStock: canAddToCart(stockStatus),
    isPublished: true,

    isFeatured: product.isFeatured ?? false,
    isNewArrival: product.isNewArrival ?? false,
    isBestSeller: product.isBestSeller ?? false,
    isTrending: product.isTrending ?? false,
    isRecommended: product.isRecommended ?? false,
    isFlashSale: product.isFlashSale ?? false,

    mainImageUrl: productImage(product.name),
    mainImagePublicId: publicId(product.slug, "main"),
    mainImageAlt: product.name,

    hoverImageUrl: productImage(`${product.name} Hover`),
    hoverImagePublicId: publicId(product.slug, "hover"),
    hoverImageAlt: `${product.name} hover image`,

    videoUrl: null,
    videoPublicId: null,

    warrantyDuration: product.warrantyDuration ?? null,
    warrantyDetails: product.warrantyDetails ?? null,

    returnPolicy: product.returnPolicy ?? null,
    replacementPolicy: product.replacementPolicy ?? null,
    refundPolicy: product.refundPolicy ?? null,

    deliveryInfo: product.deliveryInfo ?? null,
    deliveryTime: product.deliveryTime ?? null,
    cashOnDelivery: product.cashOnDelivery ?? true,
    freeDelivery: product.freeDelivery ?? false,

    packageIncludes: product.packageIncludes,
    packageWeight: product.packageWeight ?? null,
    packageDimensions: product.packageDimensions ?? null,

    averageCost: costPrice,
    lastPurchaseCost: costPrice,
    stockValue,
  };
}

async function seedProducts(args: {
  categoryMap: Map<string, string>;
  subCategoryMap: Map<string, string>;
  brandMap: Map<string, string>;
}) {
  for (const product of products) {
    const categoryId = args.categoryMap.get(product.categorySlug);
    const subCategoryId = args.subCategoryMap.get(
      `${product.categorySlug}:${product.subCategorySlug}`,
    );
    const brandId = args.brandMap.get(product.brandSlug);

    if (!categoryId) {
      throw new Error(`Category not found for product: ${product.name}`);
    }

    if (!subCategoryId) {
      throw new Error(`Sub-category not found for product: ${product.name}`);
    }

    if (!brandId) {
      throw new Error(`Brand not found for product: ${product.name}`);
    }

    const commonData = buildCommonProductData(product);
    const extraImages = buildExtraImages(product);

    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        ...commonData,
        category: {
          connect: { id: categoryId },
        },
        subCategory: {
          connect: { id: subCategoryId },
        },
        brand: {
          connect: { id: brandId },
        },
        extraImages: {
          deleteMany: {},
          create: extraImages,
        },
      },
      create: {
        ...commonData,
        category: {
          connect: { id: categoryId },
        },
        subCategory: {
          connect: { id: subCategoryId },
        },
        brand: {
          connect: { id: brandId },
        },
        extraImages: {
          create: extraImages,
        },
      },
    });

    console.log(`Seeded product: ${product.name}`);
  }
}

async function main() {
  console.log("Starting Digital Xpress product seed...");

  const { categoryMap, subCategoryMap } = await seedCategories();
  const brandMap = await seedBrands();

  await seedProducts({
    categoryMap,
    subCategoryMap,
    brandMap,
  });

  console.log("Digital Xpress product seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Product seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });