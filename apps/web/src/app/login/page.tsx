import Image from "next/image";
import Link from "next/link";
import { currentSession } from "@/lib/auth";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await currentSession();
  if (session) redirect("/customers");

  const params = await searchParams;
  const hasError = params.error === "invalid";

  return (
    <main className="grid min-h-screen bg-background px-5 py-8 text-foreground md:grid-cols-[0.9fr_1.1fr]">
      <section className="flex items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[color:var(--border)] bg-white p-2">
              <Image src="/starlim-logo.png" alt="Star Lim" width={44} height={44} priority />
            </div>
            <div>
              <p className="text-sm text-[color:var(--muted)]">Nueva plataforma</p>
              <h1 className="text-2xl font-semibold">Ingresar</h1>
            </div>
          </div>

          {hasError ? (
            <div className="mb-4 rounded-md border border-[color:var(--danger)] px-3 py-2 text-sm text-[color:var(--danger)]">
              Usuario, correo o contrasena invalida.
            </div>
          ) : null}

          <form action="/api/auth/login" className="grid gap-4" method="post">
            <label className="grid gap-2 text-sm font-medium">
              Usuario o correo
              <input
                autoComplete="username"
                className="min-h-11 rounded-md border border-[color:var(--border)] bg-background px-3 outline-none focus:border-[color:var(--accent)]"
                name="identifier"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Contrasena
              <input
                autoComplete="current-password"
                className="min-h-11 rounded-md border border-[color:var(--border)] bg-background px-3 outline-none focus:border-[color:var(--accent)]"
                name="password"
                required
                type="password"
              />
            </label>
            <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 font-semibold text-white hover:bg-[color:var(--accent-strong)]">
              Entrar
            </button>
          </form>

          <div className="mt-4 flex justify-between text-sm">
            <a className="text-[color:var(--muted)] hover:text-foreground" href="/frontend/sign.php">
              Usar login PHP
            </a>
            <Link className="text-[color:var(--muted)] hover:text-foreground" href="/">
              Volver
            </Link>
          </div>
        </div>
      </section>

      <section className="hidden items-center justify-center px-8 md:flex">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-[color:var(--muted)]">Migracion segura</p>
          <h2 className="mt-2 text-4xl font-semibold leading-tight">
            Mismo usuario, nueva interfaz React y Node.
          </h2>
          <p className="mt-4 leading-7 text-[color:var(--muted)]">
            Este acceso valida los hashes existentes del ERP PHP y crea una sesion HTTP-only
            para proteger las pantallas nuevas mientras se migran los modulos.
          </p>
        </div>
      </section>
    </main>
  );
}
