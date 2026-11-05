"use client";

import { useCallback, useEffect, useState } from "react";
import {
  USER_ROLES,
  hasRole,
  roleLabel,
  type UserRole,
} from "@/lib/roles";
import { Skeleton } from "@/components/Skeleton";

/**
 * Team & Roles card (Delta 1) — Settings page. Lists every account
 * (GET /api/admin/users, admin tier and up) and, for SUPER_ADMIN
 * callers only, a role selector per account backed by
 * PATCH /api/admin/users/[id]. Admin-tier callers see the same list
 * read-only, exactly as specified; the API re-checks the tier on
 * every call, so this card is presentation, not the guard.
 * Server-side guardrails the UI surfaces verbatim: the last
 * Super Admin cannot be demoted (409 LAST_SUPER_ADMIN) and nobody
 * can demote themselves (409 SELF_DEMOTION).
 */

interface TeamUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export default function AdminTeamRoles({
  mode,
  currentUserId,
  currentRole,
}: {
  mode: "live" | "demo";
  currentUserId: string | null;
  currentRole: string | null;
}) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const canEdit = hasRole(currentRole, "super_admin");

  const load = useCallback(async () => {
    if (mode !== "live") return;
    setLoadError(null);
    try {
      const params = query.trim()
        ? `?q=${encodeURIComponent(query.trim())}`
        : "";
      const res = await fetch(`/api/admin/users${params}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        throw new Error(json?.error ?? "Could not load the team list.");
      }
      setUsers(json.users ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load the team list.",
      );
    }
  }, [mode, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: TeamUser, role: UserRole) {
    if (role === user.role) return;
    setBusyId(user.id);
    setFeedback(null);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.message ?? json?.error ?? "Could not change the role.",
        );
      }
      setUsers((prev) =>
        (prev ?? []).map((u) =>
          u.id === user.id ? { ...u, role: json.user?.role ?? role } : u,
        ),
      );
      setFeedback(
        `${user.name ?? user.email ?? "Account"} is now ${roleLabel(role)}.`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not change the role.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-admin-border bg-white p-5">
      <div className="mb-4 border-b border-admin-border pb-3">
        <h2 className="text-[15px] font-bold tracking-tight text-admin-heading">
          Team &amp; roles
        </h2>
        <p className="mt-1 text-[13px] text-admin-muted">
          Account tiers: Customer → Operations Manager → Admin → Super
          Admin. Operations Managers run the day (queues, handovers,
          desk payments); Admins also control money and configuration;
          only a Super Admin can change roles.
          {mode === "live" && !canEdit
            ? " Your tier sees this list read-only."
            : ""}
        </p>
      </div>

      {mode !== "live" ? (
        <p className="text-sm text-admin-muted">
          Team accounts live in the database — connect Supabase (live mode)
          to manage roles. In demo mode there are no real accounts to list.
        </p>
      ) : loadError ? (
        <div>
          <p className="text-sm font-bold text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-press mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      ) : users === null ? (
        <div aria-label="Loading team">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-2 h-12 w-full" />
        </div>
      ) : (
        <>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <label className="sr-only" htmlFor="team-search">
              Search accounts
            </label>
            <input
              id="team-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or phone…"
              className="min-h-[44px] flex-1 rounded-lg border border-admin-border px-3.5 text-sm text-ink-900 outline-none focus:border-brand-600"
            />
            <button
              type="submit"
              className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
            >
              Search
            </button>
          </form>

          {feedback && (
            <p role="status" className="mb-3 rounded-lg bg-brand-50 px-3 py-2.5 text-[13px] font-semibold text-brand-800">
              {feedback}
            </p>
          )}
          {actionError && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-800">
              {actionError}
            </p>
          )}

          {users.length === 0 ? (
            <p className="text-sm text-admin-muted">No accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-admin-border text-[11px] uppercase tracking-[0.12em] text-admin-muted">
                    <th className="py-2.5 pr-3 font-bold">Account</th>
                    <th className="py-2.5 pr-3 font-bold">Contact</th>
                    <th className="py-2.5 font-bold">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-admin-border">
                  {users.map((u) => {
                    const isSelf = currentUserId !== null && u.id === currentUserId;
                    return (
                      <tr key={u.id} className="hover:bg-admin-panel/60">
                        <td className="py-3 pr-3">
                          <span className="font-bold text-ink-900">
                            {u.name ?? "Unnamed"}
                          </span>
                          {isSelf && (
                            <span className="ml-2 rounded-full bg-admin-panel px-2 py-0.5 text-[11px] font-bold text-admin-muted">
                              You
                            </span>
                          )}
                          {u.disabled && (
                            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-ink-900">
                          {u.email ?? "—"}
                          <span className="block text-xs text-admin-muted">
                            {u.phone ?? ""}
                          </span>
                        </td>
                        <td className="py-3">
                          {canEdit ? (
                            <label className="sr-only" htmlFor={`role-${u.id}`}>
                              Role for {u.name ?? u.email ?? "account"}
                            </label>
                          ) : null}
                          {canEdit ? (
                            <select
                              id={`role-${u.id}`}
                              value={u.role}
                              disabled={busyId === u.id}
                              onChange={(e) =>
                                void changeRole(u, e.target.value as UserRole)
                              }
                              className="min-h-[40px] rounded-lg border border-admin-border bg-white px-2.5 text-sm font-semibold text-ink-900 disabled:opacity-50"
                            >
                              {USER_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabel(role)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold text-ink-900">
                              {roleLabel(u.role)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && (
            <p className="mt-3 text-[13px] text-admin-muted">
              You cannot lower your own role, and the last Super Admin
              cannot be demoted — promote a second Super Admin first.
            </p>
          )}
        </>
      )}
    </section>
  );
}
