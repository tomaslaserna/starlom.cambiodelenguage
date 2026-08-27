import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthPageShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function AuthPageShell({ children, description, eyebrow, title }: AuthPageShellProps) {
  return (
    <main className="grid min-h-screen overflow-x-hidden bg-[#f3f6fb] text-[#172033] lg:grid-cols-[minmax(360px,40%)_minmax(0,60%)]">
      <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden p-5 text-white sm:p-6 lg:min-h-screen lg:justify-between lg:p-8">
        <Image alt="Productos de limpieza Starlim" className="auth-floating-products object-cover object-center" fill priority sizes="(max-width: 1023px) 100vw, 40vw" src="/starlim-floating-products.webp" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(3,41,99,0.95)_0%,rgba(4,75,172,0.84)_52%,rgba(2,48,112,0.72)_100%)]" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link aria-label="Starlim" className="inline-flex" href="/">
            <Image alt="Starlim" className="h-auto w-[180px] object-contain" height={81} priority src="/starlim-logo-white.png" width={180} />
          </Link>
          <Link
            className="inline-flex min-h-10 items-center rounded-[10px] border border-white/25 bg-white/10 px-4 font-extrabold text-white/90 hover:bg-white/15"
            href="/login"
          >
            Iniciar sesión
          </Link>
        </div>

        <div className="relative z-10 max-w-[500px] py-8 lg:py-20">
          <span className="erp-text-caption inline-flex items-center gap-2 font-black uppercase text-white/85 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#ffb74d] before:content-['']">
            Acceso seguro
          </span>
          <h1 className="mt-5 text-[clamp(30px,7vw,62px)] font-black leading-none tracking-normal text-white">
            Recuperá el acceso a tu cuenta.
          </h1>
          <p className="erp-text-base mt-6 max-w-[430px] leading-7 text-white/80">
            El enlace de recuperación es personal, vence y solo puede utilizarse para establecer una contraseña nueva.
          </p>
        </div>

        <p className="relative z-10 hidden max-w-[430px] text-sm font-semibold leading-6 text-white/70 lg:block">
          Starlim nunca te pedirá que compartas el enlace ni la contraseña por mensaje.
        </p>
      </section>

      <section className="grid min-h-0 min-w-0 place-items-center bg-[linear-gradient(90deg,rgba(255,255,255,0.55)_0_1px,transparent_1px_100%),linear-gradient(0deg,rgba(255,255,255,0.62)_0_1px,transparent_1px_100%),#f3f6fb] bg-[length:64px_64px] px-4 py-8 sm:px-8 lg:min-h-screen">
        <div className="w-full max-w-[456px] rounded-[12px] border border-[#dbe4f0] bg-white p-8 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="mb-6">
            <span className="erp-text-caption inline-flex items-center gap-2 font-black uppercase text-[#1f3f6f] before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#ffb74d] before:content-['']">
              {eyebrow}
            </span>
            <h2 className="mt-3 text-[32px] font-black leading-tight tracking-normal text-[#0f172a]">{title}</h2>
            <p className="erp-text-body mt-2 leading-6 text-[#5b6b82]">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
