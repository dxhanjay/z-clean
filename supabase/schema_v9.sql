-- ═══════════════════════════════════════════════════════════════════
-- Z-clean schema v9 (Delta 3 — customer reviews, 2026-11-05)
--
-- 1. reviews — REAL customer testimonials, earned the slow way: one
--    review per order, written by the order's owner, only after the
--    order reaches DELIVERED, and published on the storefront ONLY
--    after a staff member approves it in /admin/reviews. There is
--    deliberately NO seed data and NO way for the public site to show
--    an unapproved or invented review: the homepage Testimonials
--    section renders approved rows from this table and hides itself
--    entirely while there are none.
--
-- RLS:
--   - insert: only the order's owner, only for their own DELIVERED
--     order (the exists-subquery runs under the caller's RLS, so a
--     foreign order is invisible and fails the check). The
--     POST /api/reviews route re-checks the same rules and maps the
--     unique(order_id) violation to 409 ALREADY_REVIEWED.
--   - select: APPROVED rows are public (the storefront reads them
--     with the anon key); owners read their own rows at any approval
--     state; admins read everything (moderation queue).
--   - update: admins only (the approve / un-approve moderation flag);
--     customers can never edit a submitted review, so what was
--     approved is exactly what the customer wrote.
--   - delete: admins (moderation), plus an owner may delete their
--     own still-UNAPPROVED review (change of mind before it is seen).
--
-- APPLICATION ORDER: run this BEFORE deploying the Delta 3 code —
-- POST /api/reviews writes here and the storefront reads here.
-- Until it is applied, both degrade gracefully (POST answers 500,
-- the approved-reviews reads answer an empty list).
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · reviews table ─────────────────────────────────────────────
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.orders (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  text       text not null check (char_length(text) between 3 and 1000),
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reviews_user_id_idx
  on public.reviews (user_id);

-- The storefront query: approved only, newest first.
create index if not exists reviews_approved_created_idx
  on public.reviews (approved, created_at desc);

alter table public.reviews enable row level security;

-- Owner insert, gated on owning a DELIVERED order.
-- (drop-then-create keeps the file re-runnable.)
drop policy if exists "reviews: insert own delivered order" on public.reviews;
create policy "reviews: insert own delivered order"
  on public.reviews for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
        and o.status = 'DELIVERED'
    )
  );

-- Public read of approved rows; owners read their own; admins read all.
drop policy if exists "reviews: select approved, own or admin" on public.reviews;
create policy "reviews: select approved, own or admin"
  on public.reviews for select
  using (approved = true or user_id = auth.uid() or public.is_admin());

-- Moderation flag is staff-only.
drop policy if exists "reviews: update admin" on public.reviews;
create policy "reviews: update admin"
  on public.reviews for update
  using (public.is_admin())
  with check (public.is_admin());

-- Admins delete for moderation; owners may retract a pending review.
drop policy if exists "reviews: delete admin or own pending" on public.reviews;
create policy "reviews: delete admin or own pending"
  on public.reviews for delete
  using (
    public.is_admin()
    or (user_id = auth.uid() and approved = false)
  );
