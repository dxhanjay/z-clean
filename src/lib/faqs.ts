/**
 * Z-clean FAQs (moved out of src/app/faq/page.tsx in Delta 3 so the
 * homepage FAQ teaser and the FAQ page share ONE source — the teaser
 * can never drift from the full answers).
 *
 * Original answers only — no claims about areas, prices or timelines
 * that have not been confirmed by the business owner yet.
 */
export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: "How do I book a pickup?",
    a: "Create an account, choose your services and pick a pickup slot that suits you. Our pickup partner comes to your address, tags your items and counts or weighs them in front of you.",
  },
  {
    q: "How is the price of my order decided?",
    a: "Each service is priced by a unit — per kg for wash & fold, per piece for dry cleaning and ironing, per pair for shoes, per sq ft for carpets. The exact total is confirmed with you at pickup, once items are counted or weighed, and nothing is cleaned until you approve it.",
  },
  {
    q: "How can I pay?",
    a: "You can pay online when you book, or pay on delivery when your order comes back. Online payments are confirmed by our payment provider before your order is marked paid.",
  },
  {
    q: "Can I track my order?",
    a: "Yes. Your account shows your order's status as it moves — pickup scheduled, picked up, in process, ready, out for delivery and delivered — so you always know where your laundry is.",
  },
  {
    q: "Will my laundry be mixed with other customers' clothes?",
    a: "No. Your items are tagged at pickup and washed as your own separate load. Sorting by colour and fabric happens within your order, never across customers.",
  },
  {
    q: "What happens if an item needs special care?",
    a: "During inspection, anything delicate, embellished or stained gets flagged. If it needs treatment beyond the service you booked, we contact you and only proceed with your approval.",
  },
  {
    q: "Do you offer express service?",
    a: "Express turnaround will be available for selected services in our launch areas. Where it is offered, the express price and delivery time are shown and confirmed before you book — never added afterwards.",
  },
  {
    q: "Which areas do you serve?",
    a: "Our launch service areas are being confirmed and will be listed on this page and during booking as soon as they are live. If your area is not covered yet, creating an account keeps you first in line when we open there.",
  },
  {
    q: "What if something comes back not quite right?",
    a: "Tell us through your account or the contact page. Items that miss our quality check standard are re-processed — that is exactly what the final quality-check stage is for.",
  },
];
