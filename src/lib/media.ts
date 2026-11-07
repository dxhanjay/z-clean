/**
 * Sri Clean site imagery.
 *
 * All photos are hotlinked from the Laundra template CDN (Webflow) — the
 * design reference for this site. They are centralised here so every image
 * can be swapped for Sri Clean's own photography later by editing this one
 * file. No binaries are stored in the repo.
 */

const CDN_A = "https://cdn.prod.website-files.com/6a7b8a71626a80091510f0be";
const CDN_B = "https://cdn.prod.website-files.com/6a7b8a71626a80091510f0bc";

export interface SiteImage {
  src: string;
  alt: string;
}

/** Homepage hero slider, in rotation order. */
export const heroImages: SiteImage[] = [
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0eb_Slider%2001%20img.webp`,
    alt: "Bright, tidy laundry room with machines and folded clothes",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0e9_Slider%2002%20img.webp`,
    alt: "Clean laundry being handed over at the door",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0ea_Slider%203%20img.webp`,
    alt: "Washing machine drum filled with fresh laundry",
  },
];

/** Homepage About band collage. */
export const aboutImages: SiteImage[] = [
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0f2_home-about-img-1.webp`,
    alt: "Laundry being sorted and prepared for washing",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0f3_home-about-img-2.webp`,
    alt: "Freshly cleaned clothes being folded",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0f4_home-about-img-3.webp`,
    alt: "Neatly finished laundry ready for delivery",
  },
];

/** "Why Sri Clean" section image. */
export const whyImage: SiteImage = {
  src: `${CDN_A}/6a7b8a71626a80091510f0f5_why-image.webp`,
  alt: "Garments receiving careful, hands-on cleaning",
};

/**
 * Card / detail-page photo for EVERY service, keyed by service slug
 * (owner request, Nov 6, 2026: no service card without an image).
 * Three are hotlinked template photos; the other five are Sri Clean's own
 * generated images, self-hosted under /public/services/.
 */
export const serviceImages: Record<string, SiteImage> = {
  "laundry-wash-and-fold": {
    src: `${CDN_B}/6a7b8a71626a80091510f0df_service-image-01.webp`,
    alt: "Fresh laundry being folded into neat stacks",
  },
  "wash-and-iron": {
    src: "/services/wash-and-iron.webp",
    alt: "Stack of freshly washed and pressed shirts in white and pastel blue",
  },
  "steam-iron-press": {
    src: `${CDN_B}/6a7b8a71626a80091510f117_service-image-2.webp`,
    alt: "Garment being finished with a steam iron",
  },
  "dry-cleaning": {
    src: `${CDN_B}/6a7b8a71626a80091510f0fd_service-image-3.webp`,
    alt: "Woollen garments carefully folded after cleaning",
  },
  "shoe-cleaning": {
    src: "/services/shoe-cleaning.webp",
    alt: "White sneakers being gently brushed clean with foam",
  },
  "leather-care": {
    src: "/services/leather-care.webp",
    alt: "Leather bag and jacket being conditioned with balm and a soft cloth",
  },
  "curtain-cleaning": {
    src: "/services/curtain-cleaning.webp",
    alt: "Freshly cleaned curtains hanging at a bright window",
  },
  "carpet-cleaning": {
    src: "/services/carpet-cleaning.webp",
    alt: "Carpet being deep cleaned with a professional machine",
  },
};

/** How It Works step photos, in the same order as `howItWorksSteps`. */
export const stepImages: SiteImage[] = [
  {
    src: `${CDN_A}/6a7b8a71626a80091510f19c_work-img-1.webp`,
    alt: "Booking a laundry pickup",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f19e_work-img-2.webp`,
    alt: "Laundry being collected from the doorstep",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f0ff_work-image-3.svg`,
    alt: "Illustration of the expert cleaning stage",
  },
  {
    src: `${CDN_A}/6a7b8a71626a80091510f19d_work-img-4.webp`,
    alt: "Fresh laundry delivered back to the door",
  },
];
