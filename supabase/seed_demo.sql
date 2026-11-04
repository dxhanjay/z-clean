-- ============================================================================
-- Z-clean — DEMO SEED (Phase 2)
-- ============================================================================
-- ⚠️ DEMO DATA ONLY. Everything in this file is demo content for the
-- Bokaro Steel City launch demo: draft prices (see PRICE_LIST_DRAFT.md),
-- demo service areas, a demo phone number, and a DEMO first-order coupon.
-- None of it is the business's confirmed real data. Replace before launch.
--
-- Run AFTER supabase/schema.sql, in the Supabase SQL editor or via
-- `supabase db push` + `psql -f supabase/seed_demo.sql`.
-- All money is integer paise (₹1 = 100 paise). Safe to re-run (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Services (demo turnaround defaults from the reference model:
-- Laundry 48h, Dry Clean 72h, Shoes 3–5 days)
-- ----------------------------------------------------------------------------
insert into public.services (slug, name, pricing_unit, turnaround_hours) values
  ('laundry-wash-and-fold', 'Laundry Wash & Fold', 'kg',    48),
  ('wash-and-iron',         'Wash & Iron',         'kg',    48),
  ('dry-cleaning',          'Dry Cleaning',        'piece', 72),
  ('steam-iron-press',      'Steam Iron / Press',  'piece', 24),
  ('shoe-cleaning',         'Shoe Cleaning',       'pair',  120),
  ('leather-care',          'Leather Care',        'piece', 120),
  ('curtain-cleaning',      'Curtain Cleaning',    'piece', 96),
  ('carpet-cleaning',       'Carpet Cleaning',     'sqft',  96)
on conflict (slug) do update
  set name = excluded.name,
      pricing_unit = excluded.pricing_unit,
      turnaround_hours = excluded.turnaround_hours;

-- ----------------------------------------------------------------------------
-- Price items — APPROVED prices from PRICE_LIST_DRAFT.md (market-researched
-- draft approved by the owner on 2026-11-04).
-- Mirrors src/lib/pricing.ts exactly. Express multiplier 1.5 everywhere.
-- ----------------------------------------------------------------------------
insert into public.price_items (service_id, item_name, price_paise, express_multiplier)
select s.id, v.item_name, v.price_paise, 1.50
from public.services s
join (values
  ('laundry-wash-and-fold', 'Wash & Fold',                              7000),
  ('wash-and-iron',         'Wash & Iron',                             11000),
  ('dry-cleaning',          'Shirt / T-Shirt',                          8000),
  ('dry-cleaning',          'Trouser / Jeans',                          9000),
  ('dry-cleaning',          'Kurta',                                    9000),
  ('dry-cleaning',          'Dress',                                   17900),
  ('dry-cleaning',          'Blazer / Jacket',                         19900),
  ('dry-cleaning',          'Suit — 2 piece',                          29900),
  ('dry-cleaning',          'Suit — 3 piece',                          37900),
  ('dry-cleaning',          'Sherwani',                                44900),
  ('dry-cleaning',          'Coat',                                    24900),
  ('dry-cleaning',          'Sweater / Sweatshirt',                    14900),
  ('dry-cleaning',          'Saree — plain / cotton',                  19900),
  ('dry-cleaning',          'Saree — heavy / silk / embroidered',      29900),
  ('dry-cleaning',          'Lehenga — regular',                       49900),
  ('dry-cleaning',          'Lehenga — heavy / bridal',                89900),
  ('dry-cleaning',          'Blanket — single',                        24900),
  ('dry-cleaning',          'Blanket — double',                        34900),
  ('dry-cleaning',          'Quilt / Rajai — single',                  34900),
  ('dry-cleaning',          'Quilt / Rajai — double',                  44900),
  ('dry-cleaning',          'Bedsheet — single',                        9900),
  ('dry-cleaning',          'Bedsheet — double',                       14900),
  ('curtain-cleaning',      'Curtain',                                 12900),
  ('carpet-cleaning',       'Carpet / Rug',                             2500),
  ('steam-iron-press',      'Shirt / T-Shirt / Trouser / Kurta',        1500),
  ('steam-iron-press',      'Saree',                                    4900),
  ('steam-iron-press',      'Suit — 2 piece (press)',                   5000),
  ('shoe-cleaning',         'Canvas shoes',                            24900),
  ('shoe-cleaning',         'Sneakers / Sports shoes',                 29900),
  ('shoe-cleaning',         'Leather shoes',                           39900),
  ('shoe-cleaning',         'Suede shoes',                             44900),
  ('leather-care',          'Leather jacket (clean + condition)',      49900),
  ('leather-care',          'Leather bag',                             39900),
  ('leather-care',          'Wallet / small leather accessory',        19900)
) as v (slug, item_name, price_paise) on v.slug = s.slug
on conflict (service_id, item_name) do update
  set price_paise = excluded.price_paise,
      express_multiplier = excluded.express_multiplier;

-- ----------------------------------------------------------------------------
-- Service areas — DEMO. Bokaro Steel City sectors with pincodes verified
-- against India Post listings (Nov 2026): Sector 1/2 → 827001,
-- Sector 3 → 827003, Sector 4 → 827004, Sector 6 → 827006,
-- Sector 8/9 (Harla side) → 827009, Chas → 827013.
-- ----------------------------------------------------------------------------
insert into public.service_areas (city, area, pincode) values
  ('Bokaro Steel City', 'Sector 1',            '827001'),
  ('Bokaro Steel City', 'Sector 2',            '827001'),
  ('Bokaro Steel City', 'Sector 3',            '827003'),
  ('Bokaro Steel City', 'Sector 4 / City Centre', '827004'),
  ('Bokaro Steel City', 'Sector 6',            '827006'),
  ('Bokaro Steel City', 'Sector 8',            '827009'),
  ('Bokaro Steel City', 'Sector 9',            '827009'),
  ('Bokaro Steel City', 'Chas',                '827013'),
  ('Bokaro Steel City', 'Balidih',             '827010'),
  ('Bokaro Steel City', 'Balidih Industrial Area', '827010'),
  ('Bokaro Steel City', 'Bokaro Station (Marafari)', '827010'),
  ('Bokaro Steel City', 'Tanr Balidih',        '827014'),
  ('Bokaro Steel City', 'Jaina More',          '829301')
on conflict (city, area) do update set pincode = excluded.pincode;

-- ----------------------------------------------------------------------------
-- Settings — DEMO values (phone is the owner-supplied demo placeholder).
-- ----------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('business_phone',                '+91244567889'),
  ('business_whatsapp',             '+91244567889'),
  ('opening_hours',                 'Mon–Sun, 9 AM – 9 PM'),
  ('free_delivery_threshold_paise', '29900'),
  ('minimum_order_paise',           '19900'),
  ('first_order_offer_note',        'DEMO: FIRST20 — 20% off your first order')
on conflict (key) do update set value = excluded.value;

-- ----------------------------------------------------------------------------
-- Coupon — DEMO first-order offer. Demo only; confirm a real offer before
-- launch. Validated server-side at checkout (Phase 3).
-- ----------------------------------------------------------------------------
insert into public.coupons (code, pct_off, first_order_only, active) values
  ('FIRST20', 20, true, true)
on conflict (code) do update
  set pct_off = excluded.pct_off,
      first_order_only = excluded.first_order_only,
      active = excluded.active;
