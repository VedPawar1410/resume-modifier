import { motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { resumeApi } from "../api/resumeApi";
import { AlertIcon } from "./Icons";

interface Props {
  onSignedIn: () => void;
}

// Shown only on the deployed app (when the API has APP_PASSWORD set).
export function LoginView({ onSignedIn }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resumeApi.login(password);
      onSignedIn();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // The API sleeps from zero on Azure, so the first request can take ~20 s or time out.
      setError(status === 401 ? "That password isn't right." : "Couldn't reach the server — it may be waking up. Try again in a few seconds.");
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <motion.form
        className="card login__card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="brand login__brand">
          <span className="brand__serif">Sourced</span>
        </p>
        <h1 className="serif login__title">Welcome back.</h1>
        <p className="muted login__lede">Every line on your résumé, sourced from your own work.</p>

        {error && (
          <div className="notice notice--error" role="alert">
            <AlertIcon />
            <div>
              <p>{error}</p>
            </div>
          </div>
        )}

        <label className="field-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="login__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
        <button className="btn btn--ink btn--lg login__submit" type="submit" disabled={!password || busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </motion.form>
    </div>
  );
}
