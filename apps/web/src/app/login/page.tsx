import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { currentSession } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await currentSession();
  if (session) redirect("/");

  const params = await searchParams;
  const hasError = params.error === "invalid";

  return (
    <main className="grid min-h-screen overflow-x-hidden bg-[#f3f6fb] text-[#172033] lg:grid-cols-[minmax(360px,40%)_minmax(0,60%)]">
      <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#0b6cff_0%,#0346a6_58%,#07357f_100%)] p-5 text-white sm:p-6 lg:min-h-screen lg:justify-between lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_100%),linear-gradient(0deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_100%)] bg-[length:56px_56px] opacity-30" />
        <div className="pointer-events-none absolute -bottom-36 -right-44 h-[420px] w-[420px] rounded-full bg-white/10" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link className="inline-flex items-center gap-3 font-black text-white" href="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/30 bg-white/15 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
              <Image src="/starlim-logo.png" alt="Starlim" width={30} height={30} priority />
            </span>
            <span>Starlim</span>
          </Link>
          <Link className="inline-flex min-h-10 items-center rounded-[10px] border border-white/25 bg-white/10 px-4 font-extrabold text-white/90 hover:bg-white/15" href="/">
            Inicio
          </Link>
        </div>

        <div className="relative z-10 max-w-[500px] py-8 lg:py-20">
          <span className="erp-text-caption inline-flex items-center gap-2 font-black uppercase text-white/85 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#ffb74d] before:content-['']">
            Sistema operativo
          </span>
          <h1 className="mt-5 text-[clamp(28px,8vw,66px)] font-black leading-none tracking-normal text-white">
            Toda tu operacion, en un solo lugar.
          </h1>
          <p className="erp-text-base mt-6 max-w-[430px] leading-7 text-white/80">
            Gestiona ventas, stock, pedidos, compras y cobranzas desde una plataforma centralizada.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {["Ventas", "Stock", "Clientes"].map((item) => (
              <span className="inline-flex min-h-[38px] items-center rounded-[10px] border border-white/25 bg-white/10 px-4 font-black text-white" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 hidden max-w-[420px] gap-3 lg:grid" aria-hidden="true">
          <div className="h-[82px] rounded-[10px] border border-white/20 bg-white/10 p-4">
            <span className="block h-2.5 w-11 rounded-full bg-white/70" />
            <strong className="mt-4 block h-[18px] w-2/3 rounded-full bg-white/70" />
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((item) => (
              <span className="h-[68px] rounded-[10px] border border-white/20 bg-white/10" key={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid min-h-0 min-w-0 place-items-center bg-[linear-gradient(90deg,rgba(255,255,255,0.55)_0_1px,transparent_1px_100%),linear-gradient(0deg,rgba(255,255,255,0.62)_0_1px,transparent_1px_100%),#f3f6fb] bg-[length:64px_64px] px-4 py-8 sm:px-8 lg:min-h-screen">
        <div className="w-full max-w-[456px]">
          {hasError ? (
            <div className="mb-3 flex items-start gap-2.5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 font-extrabold leading-5 text-[#991b1b] shadow-[0_8px_18px_rgba(153,27,27,0.06)]" role="alert">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-xs font-black text-[#b91c1c]">
                i
              </span>
              <span>Usuario, correo o contrasena invalida.</span>
            </div>
          ) : null}

          <div className="w-full rounded-[12px] border border-[#dbe4f0] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
            <div className="p-8">
              <div className="mb-6">
                <span className="erp-text-caption inline-flex items-center gap-2 font-black uppercase text-[#1f3f6f] before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#ffb74d] before:content-['']">
                  Acceso seguro
                </span>
                <h2 className="mt-3 text-[32px] font-black leading-tight tracking-normal text-[#0f172a]">
                  Iniciar sesion
                </h2>
                <p className="erp-text-body mt-2 leading-6 text-[#5b6b82]">
                  Ingresa tus credenciales para acceder al panel.
                </p>
              </div>

              <form action="/api/auth/login" className="grid min-w-0 gap-[18px]" method="post">
                <Field className="min-w-0 gap-[7px]" label="Usuario o correo" required>
                  <Input
                    autoComplete="username"
                    className="min-h-[46px] w-full min-w-0 rounded-[10px] border-[#c9d6e8] bg-[#f8fbff] px-[13px] text-[15px] focus:bg-white"
                    invalid={hasError}
                    name="identifier"
                    required
                  />
                </Field>
                <Field className="min-w-0 gap-[7px]" label="Contrasena" required>
                  <Input
                    autoComplete="current-password"
                    className="min-h-[46px] w-full min-w-0 rounded-[10px] border-[#c9d6e8] bg-[#f8fbff] px-[13px] text-[15px] focus:bg-white"
                    invalid={hasError}
                    name="password"
                    required
                    type="password"
                  />
                </Field>
                <Button className="mt-1 min-h-12 w-full rounded-[10px] bg-[#006dfe] hover:bg-[#005eea]" size="lg" type="submit">
                  Entrar al panel
                </Button>
              </form>

              <p className="erp-text-body-sm mt-5 text-center text-[#5b6b82]">
                Plataforma operativa Starlim
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
