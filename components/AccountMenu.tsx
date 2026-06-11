"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { Field, Modal } from "@/components/ui";

// Sign-in entry point in the header. Renders nothing if Firebase isn't
// configured for this deployment (cloud sync is fully optional).
export function AccountMenu() {
  const { user, authReady, firebaseEnabled, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!firebaseEnabled || !authReady) return null;

  if (!user) {
    return (
      <>
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          Sign in
        </button>
        {open && <AuthModal onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <button className="btn-ghost text-xs" onClick={() => void signOut()} title={user.email || ""}>
      {user.email} · Sign out
    </button>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "in") await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Firebase:\s*/, "") : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Firebase:\s*/, "") : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === "in" ? "Sign in" : "Create account"} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-500">
          Sign in to sync your trips across devices and share them with up to{" "}
          {5} travelers.
        </p>
        <Field label="Email">
          <input
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            className="btn-ghost text-xs"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit} disabled={loading || !email.trim() || !password}>
              {loading ? "…" : mode === "in" ? "Sign in" : "Sign up"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-ink-400">
          <div className="h-px flex-1 bg-ink-100" />
          or
          <div className="h-px flex-1 bg-ink-100" />
        </div>
        <button className="btn-secondary w-full" onClick={google} disabled={loading}>
          Continue with Google
        </button>
      </div>
    </Modal>
  );
}
