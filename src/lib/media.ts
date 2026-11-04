/**
 * Z-clean site imagery.
 *
 * All photos are hotlinked from the Laundra template CDN (Webflow) — the
 * design reference for this site. They are centralised here so every image
 * can be swapped for Z-clean's own photography later by editing this one
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

/** "Why Z-clean" section image. */
export const whyImage: SiteImage = {
  src: `${CDN_A}/6a7b8a71626a80091510f0f5_why-image.webp`,
  alt: "Garments receiving careful, hands-on cleaning",
};

/**
 * Card / detail-page photos for the services that have a matching photo,
 * keyed by service slug. Services without an entry keep the plain card.
 */
export const serviceImages: Record<string, SiteImage> = {
  "laundry-wash-and-fold": {
    src: `${CDN_B}/6a7b8a71626a80091510f0df_service-image-01.webp`,
    alt: "Fresh laundry being folded into neat stacks",
  },
  "steam-iron-press": {
    src: `${CDN_B}/6a7b8a71626a80091510f117_service-image-2.webp`,
    alt: "Garment being finished with a steam iron",
  },
  "dry-cleaning": {
    src: `${CDN_B}/6a7b8a71626a80091510f0fd_service-image-3.webp`,
    alt: "Woollen garments carefully folded after cleaning",
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
