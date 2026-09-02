import { defineCollection, z } from "astro:content";

const genetics = defineCollection({
  type: "content",
  schema: z.object({
    name: z.string(),
    lineage: z.string(),
    metaDescription: z.string().optional(),

    status: z.enum(["1st Edition", "Promo"]),
    category: z.enum(["seed", "breeder_cut", "trainer", "release", "tester", "collab"]),

    releaseDate: z.string().optional(),

    flowerTimeDays: z.tuple([z.number(), z.number()]),
    stretch: z.enum(["low", "medium", "high"]),
    biomassYield: z.enum(["low", "medium", "high"]).optional(),

    expressions: z.string().optional(),
    overview: z.string().optional(),
    growNotes: z.string().optional(),
    hashmakerNotes: z.string().optional(),

    washMetrics: z.object({
      washerFriendly: z.boolean(),
      resinType: z.string(),
      yieldEstimate: z.string(),
      preferredMicrons: z.array(z.number()),
    }),

    whereToFind: z.array(
      z.object({
        name: z.string(),
        url: z.string(),
        logo: z.string().optional(),
      })
    ).optional(),

    heroImage: z.string().optional(),
    gallery: z.array(z.string()).optional(),
    galleryAlt: z.array(z.string()).optional(),
    videos: z.array(z.string()).optional(),
    videoAlt: z.array(z.string()).optional(),
  }),
});

const drops = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    opensAt: z.string().datetime({ offset: true }),
    closesAt: z.string().datetime({ offset: true }).optional(),
    currency: z.literal("EUR"),
    shippingAmountMinor: z.literal(1000),
    paymentMethods: z.tuple([z.literal("PayPal")]),
    paymentInstructions: z.string().min(1),
    active: z.boolean(),
    items: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      sku: z.string().min(1),
      name: z.string().min(1),
      type: z.string().min(1),
      artist: z.string().min(1),
      image: z.string().min(1),
      secondaryImage: z.string().min(1).optional(),
      description: z.string().min(1),
      amountMinor: z.number().int().nonnegative(),
      stockTotal: z.number().int().nonnegative(),
      maxPerOrder: z.number().int().positive(),
      active: z.boolean(),
    })).min(1),
  }),
});

export const collections = { genetics, drops };
