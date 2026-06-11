"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { auth, firebaseEnabled } from "./firebase";

interface AuthValue {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseEnabled);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const requireAuth = () => {
    if (!auth) throw new Error("Cloud sync isn't configured for this deployment.");
    return auth;
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), email, password);
  };

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(requireAuth(), email, password);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(requireAuth(), new GoogleAuthProvider());
  };

  const signOut = async () => {
    await firebaseSignOut(requireAuth());
  };

  return (
    <AuthContext.Provider
      value={{ user, authReady, firebaseEnabled, signIn, signUp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
