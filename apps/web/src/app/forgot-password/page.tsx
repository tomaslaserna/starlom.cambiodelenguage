import Link from "next/link";
import { AuthPageShell } from "@/components/auth-page-shell";
import { Button, Field, Input } from "@/components/ui";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    status?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const sent = params.status === "sent";
  const invalid = params.error === "invalid";
  const rateLimited = params.error === "rate_limited";
  const unavailable = params.error === "unavailable";

  return (
    <AuthPageShell
      description="Ingresá el correo asociado a tu usuario y te enviaremos un enlace de recuperación."
      eyebrow="Recuperación"
      title="Olvidé mi contraseña"
    >
      {sent ? (
        <div
          className="mb-5 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 font-bold leading-6 text-[#166534]"
          role="status"
        >
          Si el correo está registrado, recibirás un enlace para cambiar la contraseña. Revisá también spam.
        </div>
      ) : null}

      {invalid || rateLimited || unavailable ? (
        <div
          className="mb-5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 font-bold leading-6 text-[#991b1b]"
          role="alert"
        >
          {rateLimited
            ? "Demasiados intentos. Probá nuevamente más tarde."
            : unavailable
              ? "No pudimos enviar el correo en este momento. Probá nuevamente más tarde."
              : "Ingresá un correo válido."}
        </div>
      ) : null}

      <form action="/api/auth/password-recovery" className="grid gap-[18px]" method="post">
        <Field htmlFor="recovery-email" label="Correo" required>
          <Input
            autoComplete="email"
            id="recovery-email"
            invalid={invalid}
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </Field>
        <Button className="w-full bg-[#006dfe] hover:bg-[#005eea]" size="lg" type="submit">
          Enviar enlace de recuperación
        </Button>
      </form>

      <p className="erp-text-body-sm mt-5 text-center text-[#5b6b82]">
        <Link className="font-extrabold text-[#075ac7] hover:underline" href="/login">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthPageShell>
  );
}
