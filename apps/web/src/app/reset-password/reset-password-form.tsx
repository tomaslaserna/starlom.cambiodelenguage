"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, Field, Input } from "@/components/ui";

type FormStatus = "checking" | "ready" | "saving" | "success" | "invalid";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [status, setStatus] = useState<FormStatus>("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const recoveryType = hash.get("type");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (!supabaseUrl || !supabaseKey || recoveryType !== "recovery" || !accessToken || !refreshToken) {
      queueMicrotask(() => {
        if (active) setStatus("invalid");
      });
      return () => {
        active = false;
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "implicit",
        persistSession: false,
      },
    });
    clientRef.current = supabase;

    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setStatus("invalid");
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });

    return () => {
      active = false;
      clientRef.current = null;
    };
  }, []);

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    const supabase = clientRef.current;
    if (!supabase) {
      setStatus("invalid");
      return;
    }

    setErrorMessage("");
    setStatus("saving");
    const { error } = await supabase.auth.updateUser({ password }).catch(() => ({
      error: new Error("Password update request failed"),
    }));

    if (error) {
      setErrorMessage(
        "code" in error && error.code === "weak_password"
          ? "Elegí una contraseña más segura."
          : "No pudimos cambiar la contraseña. Solicitá un enlace nuevo e intentá otra vez.",
      );
      setStatus("ready");
      return;
    }

    await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clientRef.current = null;
    setStatus("success");
  }

  if (status === "checking") {
    return (
      <div aria-live="polite" className="rounded-[10px] border border-[#dbe4f0] bg-[#f8fbff] px-4 py-4 font-bold text-[#334155]">
        Verificando el enlace de recuperación…
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="grid gap-4">
        <div className="rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 font-bold leading-6 text-[#991b1b]" role="alert">
          El enlace es inválido, ya fue utilizado o venció.
        </div>
        <Link className="font-extrabold text-[#075ac7] hover:underline" href="/forgot-password">
          Solicitar un enlace nuevo
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="grid gap-4">
        <div className="rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 font-bold leading-6 text-[#166534]" role="status">
          Contraseña actualizada. Ya podés ingresar con la nueva contraseña.
        </div>
        <Link className="font-extrabold text-[#075ac7] hover:underline" href="/login?password_reset=1">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-[18px]" onSubmit={submitNewPassword}>
      <Field htmlFor="new-password" label="Nueva contraseña" required>
        <Input
          autoComplete="new-password"
          disabled={status === "saving"}
          id="new-password"
          maxLength={128}
          minLength={MIN_PASSWORD_LENGTH}
          name="password"
          required
          type="password"
        />
      </Field>
      <Field htmlFor="new-password-confirmation" label="Repetir contraseña" required>
        <Input
          autoComplete="new-password"
          disabled={status === "saving"}
          id="new-password-confirmation"
          maxLength={128}
          minLength={MIN_PASSWORD_LENGTH}
          name="passwordConfirmation"
          required
          type="password"
        />
      </Field>
      {errorMessage ? (
        <p className="rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 font-bold leading-6 text-[#991b1b]" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button
        className="w-full bg-[#006dfe] hover:bg-[#005eea]"
        isLoading={status === "saving"}
        loadingLabel="Guardando contraseña"
        size="lg"
        type="submit"
      >
        Guardar contraseña
      </Button>
    </form>
  );
}
