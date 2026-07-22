import { AuthPageShell } from "@/components/auth-page-shell";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthPageShell
      description="Elegí una contraseña nueva para tu cuenta. El enlace deja de ser válido después de usarlo."
      eyebrow="Nueva contraseña"
      title="Restablecer acceso"
    >
      <ResetPasswordForm />
    </AuthPageShell>
  );
}
