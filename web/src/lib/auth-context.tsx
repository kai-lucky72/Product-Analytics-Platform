import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { auth, loadSession, saveSession } from '../lib/api';
import type { AuthResponse, Session, User } from '../lib/types';

interface AuthContextValue {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshProjects: () => Promise<void>;
  setActiveProject: (projectId: string, projectName: string) => void;
  setKeys: (queryKey: string, ingestionKey: string) => void;
  user: User | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function fromAuthResponse(res: AuthResponse, projectName?: string): Session {
  return {
    token: res.token,
    user: res.user,
    activeProjectId: res.user.projectId ?? '',
    queryKey: res.apiKeys?.query,
    ingestionKey: res.apiKeys?.ingestion,
    projectName,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const login = useCallback(async (email: string, password: string) => {
    const res = await auth.login({ email, password });
    let next = fromAuthResponse(res);
    const projects = await auth.listProjects(res.token);
    if (projects.length > 0) {
      next = { ...next, activeProjectId: projects[0].id, projectName: projects[0].name };
      try {
        const keys = await auth.listApiKeys(res.token, projects[0].id);
        const queryKey = keys.find((k) => k.type === 'query');
        const ingestionKey = keys.find((k) => k.type === 'ingestion');
        // Login responses only expose key metadata; carry over any keys already
        // held in localStorage for this user so the dashboard stays usable.
        const prev = loadSession();
        next = {
          ...next,
          queryKey: prev?.queryKey ?? undefined,
          ingestionKey: prev?.ingestionKey ?? undefined,
          user: { ...next.user, projectId: projects[0].id },
        };
        void queryKey;
        void ingestionKey;
      } catch {
        /* keys optional on login */
      }
    }
    saveSession(next);
    setSession(next);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name: string; organizationName?: string }) => {
      const res = await auth.register(input);
      const next = fromAuthResponse(res, 'Demo Project');
      saveSession(next);
      setSession(next);
    },
    [],
  );

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!session) return;
    const projects = await auth.listProjects(session.token);
    const active = projects.find((p) => p.id === session.activeProjectId) ?? projects[0];
    const next: Session = {
      ...session,
      activeProjectId: active?.id ?? '',
      projectName: active?.name ?? session.projectName,
    };
    saveSession(next);
    setSession(next);
  }, [session]);

  const setActiveProject = useCallback(
    (projectId: string, projectName: string) => {
      if (!session) return;
      const next = { ...session, activeProjectId: projectId, projectName };
      saveSession(next);
      setSession(next);
    },
    [session],
  );

  const setKeys = useCallback(
    (queryKey: string, ingestionKey: string) => {
      if (!session) return;
      const next = { ...session, queryKey, ingestionKey };
      saveSession(next);
      setSession(next);
    },
    [session],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        login,
        register,
        logout,
        refreshProjects,
        setActiveProject,
        setKeys,
        user: session?.user ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
