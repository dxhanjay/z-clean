import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { isAdminTier, roleLevel } from "../lib/roles";

/**
 * Auth state for the app (Mobile Phase 1).
 *
 * Session comes from the Supabase client (persisted in
 * AsyncStorage). The admin flag is the user's profiles.role read
 * from the database — the same source the web gate uses; it only
 * controls what the app SHOWS. The server re-checks the role on
 * every admin API call, so a tampered client gains nothing.
 *
 * Delta 1: the raw tier (`role`) and its numeric `roleLevel` are
 * exposed alongside the boolean — ops_manager (1) sees operations,
 * admin (2)+ also sees Finance / Reports / Pricing / Settings.
 */
interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  /** Raw profiles.role ('customer' | 'ops_manager' | 'admin' | 'super_admin'). */
  role: string | null;
  /** Numeric tier: customer 0, ops_manager 1, admin 2, super_admin 3. */
  roleLevel: number;
  profileName: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    name: string,
    email: string,
    phone: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  loading: true,
  session: null,
  user: null,
  isAdmin: false,
  role: null,
  roleLevel: 0,
  profileName: null,
  signIn: async () => ({ error: "Not ready" }),
  signUp: async () => ({ error: "Not ready", needsConfirmation: false }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!userId) {
      setIsAdmin(false);
      setRole(null);
      setProfileName(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", userId)
      .maybeSingle();
    setRole(data?.role ?? null);
    setIsAdmin(isAdminTier(data?.role));
    setProfileName(data?.name ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
      if (mounted) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      await loadProfile(next?.user.id ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error ? error.message : null };
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, phone: string, password: string) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), phone: phone.trim() } },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    await loadProfile(current?.user.id ?? null);
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      isAdmin,
      role,
      roleLevel: roleLevel(role),
      profileName,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [loading, session, isAdmin, role, profileName, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
