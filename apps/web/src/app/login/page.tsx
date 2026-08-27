import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { currentSession } from "@/lib/auth";
import { getPublicClosedSalesCount } from "@/lib/public-metrics";
import { safeLocalReturnPath } from "@/lib/safe-return-path";
import { TestimonialsCarousel } from "./testimonials-carousel";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    expired?: string;
    next?: string;
    password_reset?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeLocalReturnPath(params.next);
  const session = await currentSession();
  if (session) redirect(returnTo);

  const hasError = params.error === "invalid";
  const isRateLimited = params.error === "rate_limited";
  const sessionExpired = params.expired === "1";
  const passwordReset = params.password_reset === "1";
  const closedSalesCount = await getPublicClosedSalesCount();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f8fc] text-[#172033]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,58%)_minmax(420px,42%)]">
      <section className="relative flex min-h-[680px] min-w-0 flex-col overflow-hidden p-5 text-white sm:p-8 lg:min-h-screen lg:p-12">
        <Image alt="Productos de limpieza Starlim" className="auth-floating-products object-cover object-center" fill priority sizes="(max-width: 1023px) 100vw, 58vw" src="/starlim-floating-products.webp" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(3,41,99,0.94)_0%,rgba(4,75,172,0.82)_48%,rgba(2,48,112,0.68)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(255,255,255,0.18),transparent_26rem)]" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link aria-label="Starlim" className="inline-flex" href="/">
            <Image alt="Starlim" className="h-auto w-[190px] object-contain sm:w-[230px]" height={104} priority src="/starlim-logo-white.png" width={230} />
          </Link>
          <div className="flex items-center gap-2">
            <Link className="erp-display-font inline-flex min-h-10 items-center rounded-[11px] bg-[#ffb74d] px-4 text-sm font-extrabold text-[#173052] shadow-sm hover:bg-[#ffc66b]" href="/tienda">TIENDA</Link>
            <a className="erp-display-font inline-flex min-h-10 items-center rounded-[11px] border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20" href="#acceso">Acceder</a>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-[650px] py-12 lg:py-20">
          <span className="erp-display-font erp-text-caption inline-flex items-center gap-2 font-semibold uppercase tracking-[0.06em] text-white/85 before:h-2.5 before:w-2.5 before:rounded-full before:bg-[#ffb74d] before:content-['']">
            Soluciones integrales de higiene
          </span>
          <h1 className="mt-5 text-[clamp(2.5rem,6vw,5rem)] font-extrabold leading-[1.1] tracking-[-0.05em] text-white">
            Limpieza profesional que acompaña tu operación.
          </h1>
          <p className="mt-6 max-w-[570px] text-base font-medium leading-7 text-white/84 sm:text-lg">
            Abastecemos empresas e instituciones con productos, asesoramiento y seguimiento personalizado para que nunca falte lo esencial.
          </p>
          <Link className="erp-display-font mt-8 inline-flex min-h-12 items-center justify-center rounded-[12px] bg-[#ffb74d] px-7 font-extrabold text-[#173052] shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-[#ffc66b]" href="/tienda">
            TIENDA · Armá tu pedido
          </Link>
          <div className="mt-9 grid max-w-[590px] grid-cols-2 gap-3 sm:grid-cols-4">
            {[["+100", "clientes"], ["Integral", "abastecimiento"], ["Ágil", "respuesta"], ["Cercano", "seguimiento"]].map(([value, label]) => (
              <div className="rounded-[14px] border border-white/22 bg-white/10 px-4 py-3.5 backdrop-blur-md" key={label}>
                <strong className="erp-display-font block text-xl font-bold text-white">{value}</strong>
                <span className="mt-1 block text-xs font-semibold text-white/72">{label}</span>
              </div>
            ))}
          </div>
          {closedSalesCount !== null ? (
            <div className="mt-4 flex max-w-[590px] items-center gap-4 rounded-[14px] border border-white/25 bg-[#032c70]/45 px-5 py-4 shadow-[0_14px_32px_rgba(0,22,66,0.18)] backdrop-blur-md" role="status">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7ee2bc] opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#58d6a6]" />
              </span>
              <p className="leading-tight text-white">
                <strong className="erp-display-font block text-lg font-bold sm:text-xl">
                  +{closedSalesCount.toLocaleString("es-AR")} ventas exitosamente cerradas
                </strong>
                <span className="mt-1 block text-xs font-semibold text-white/70">Dato histórico actualizado en vivo desde nuestro sistema</span>
              </p>
            </div>
          ) : null}
        </div>

        <p className="relative z-10 max-w-[560px] text-sm font-semibold leading-6 text-white/70">Starlim SAS · Distribución, fabricación y asesoramiento para una gestión de higiene más simple.</p>
      </section>

      <section id="acceso" className="grid min-h-0 min-w-0 place-items-center bg-[linear-gradient(90deg,rgba(255,255,255,0.55)_0_1px,transparent_1px_100%),linear-gradient(0deg,rgba(255,255,255,0.62)_0_1px,transparent_1px_100%),#f3f6fb] bg-[length:64px_64px] px-4 py-8 sm:px-8 lg:min-h-screen lg:sticky lg:top-0">
        <div className="w-full max-w-[456px]">
          {passwordReset ? (
            <div className="mb-3 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-3 font-extrabold leading-5 text-[#166534] shadow-[0_8px_18px_rgba(22,101,52,0.06)]" role="status">
              Contraseña actualizada. Ingresá con tu nueva contraseña.
            </div>
          ) : null}
          {hasError || isRateLimited || sessionExpired ? (
            <div className="mb-3 flex items-start gap-2.5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 font-extrabold leading-5 text-[#991b1b] shadow-[0_8px_18px_rgba(153,27,27,0.06)]" role="alert">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-xs font-black text-[#b91c1c]">
                i
              </span>
              <span>
                {isRateLimited
                  ? "Demasiados intentos. Proba nuevamente mas tarde."
                  : sessionExpired
                    ? "La sesion vencio. Inicia sesion para continuar con la carga abierta."
                    : "Usuario, correo o contrasena invalida."}
              </span>
            </div>
          ) : null}

          <div className="w-full rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_20px_54px_rgba(15,23,42,0.10)]">
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
                <input name="next" type="hidden" value={returnTo} />
                <Field className="min-w-0 gap-[7px]" label="Usuario o correo" required>
                  <Input
                    autoComplete="username"
                    className="min-h-[46px] w-full min-w-0 rounded-[10px] border-[#c9d6e8] bg-[#f8fbff] px-[13px] text-[15px] focus:bg-white"
                    invalid={hasError || isRateLimited}
                    name="identifier"
                    required
                  />
                </Field>
                <Field className="min-w-0 gap-[7px]" label="Contrasena" required>
                  <Input
                    autoComplete="current-password"
                    className="min-h-[46px] w-full min-w-0 rounded-[10px] border-[#c9d6e8] bg-[#f8fbff] px-[13px] text-[15px] focus:bg-white"
                    invalid={hasError || isRateLimited}
                    name="password"
                    required
                    type="password"
                  />
                </Field>
                <div className="-mt-2 text-right">
                  <Link className="erp-text-body-sm font-extrabold text-[#075ac7] hover:underline" href="/forgot-password">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <Button className="mt-1 w-full rounded-[10px] bg-[#006dfe] hover:bg-[#005eea]" size="lg" type="submit">
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
      </div>

      <section className="border-t border-[#dbe5f1] bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-[1320px]">
          <div className="max-w-3xl">
            <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#1769e8]">Nuestra forma de trabajar</span>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3.5rem)] font-bold leading-tight tracking-[-0.045em] text-[#13213a]">Más que productos: continuidad, criterio y respuesta.</h2>
            <p className="mt-5 text-base leading-7 text-[#68778e] sm:text-lg">Construimos relaciones sostenidas con cada cliente, entendiendo su consumo y proponiendo soluciones acordes a cada operación.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[["01", "Relevamiento", "Escuchamos la necesidad, el uso y la frecuencia para recomendar la alternativa adecuada."], ["02", "Abastecimiento", "Integramos químicos, papelería, bolsas, utensilios y descartables en una sola gestión."], ["03", "Seguimiento", "Acompañamos la recompra y ajustamos la propuesta según el consumo real de cada cliente."]].map(([number, title, copy]) => (
              <article className="rounded-[18px] border border-[#dbe5f1] bg-[#f8fbff] p-6 shadow-[var(--shadow-xs)]" key={number}>
                <span className="erp-display-font text-sm font-bold text-[#1769e8]">{number}</span>
                <h3 className="mt-8 text-xl font-bold text-[#13213a]">{title}</h3>
                <p className="mt-3 leading-6 text-[#68778e]">{copy}</p>
              </article>
            ))}
          </div>
          <div className="mt-14 grid gap-8 rounded-[22px] bg-[#0a47ad] p-7 text-white shadow-[var(--shadow-md)] md:grid-cols-[0.8fr_1.2fr] md:p-10">
            <div>
              <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#9cc7ff]">Sectores que atendemos</span>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em]">Soluciones para operaciones muy distintas.</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {["Gastronomía", "Industria", "Instituciones", "Salud", "Eventos", "Comercios"].map((sector) => (
                <span className="erp-display-font flex min-h-14 items-center justify-center rounded-[12px] border border-white/16 bg-white/8 px-3 text-center text-sm font-semibold" key={sector}>{sector}</span>
              ))}
            </div>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[20px] border border-[#dbe5f1] p-7">
              <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#07966f]">Especialidades</span>
              <h3 className="mt-3 text-2xl font-bold">Una propuesta integral de higiene profesional</h3>
              <p className="mt-4 leading-7 text-[#68778e]">Productos químicos, papelería institucional, bolsas, descartables, accesorios y equipamiento seleccionados según cada necesidad.</p>
            </article>
            <article className="rounded-[20px] border border-[#dbe5f1] p-7">
              <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#1769e8]">Trayectoria</span>
              <h3 className="mt-3 text-2xl font-bold">Experiencia construida cliente a cliente</h3>
              <p className="mt-4 leading-7 text-[#68778e]">Nuestra trayectoria se sostiene en la cercanía, el conocimiento del consumo y la capacidad de resolver con agilidad.</p>
            </article>
          </div>
        </div>
      </section>

      <TestimonialsCarousel />

      <section className="border-t border-[#dbe5f1] bg-[#f7faff] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[1320px]">
          <div className="mb-12 max-w-2xl">
            <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#1769e8]">Contacto</span>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3.25rem)] font-bold tracking-[-0.045em] text-[#13213a]">Estamos para ayudarte.</h2>
            <p className="mt-4 text-base leading-7 text-[#68778e]">Comunicate directamente con el área que necesitás.</p>
          </div>

          <div className="border-t border-[#cedbea] pt-7">
            <h3 className="erp-display-font text-xl font-bold uppercase tracking-[-0.02em] text-[#13213a]">Área administrativa</h3>
            <div className="mt-6 grid gap-x-12 gap-y-8 md:grid-cols-2">
              <article>
                <h4 className="text-base font-bold text-[#13213a]">FINOCCHIETTI, Augusto José</h4>
                <p className="mt-1.5 text-sm font-medium text-[#53647d]">Administración</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold">
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="mailto:augustofinocchietti@hotmail.com"><span aria-hidden="true">✉</span> augustofinocchietti@hotmail.com</a>
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="tel:+543516076606"><span aria-hidden="true">☎</span> +54 9 351 607-6606</a>
                </div>
              </article>
              <article>
                <h4 className="text-base font-bold text-[#13213a]">Administración de oficinas</h4>
                <p className="mt-1.5 text-sm font-medium text-[#53647d]">Gestión administrativa general</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold">
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="mailto:starlimmsas@gmail.com"><span aria-hidden="true">✉</span> starlimmsas@gmail.com</a>
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="tel:+543513737820"><span aria-hidden="true">☎</span> +54 9 351 373-7820</a>
                </div>
              </article>
            </div>
          </div>

          <div className="mt-12 border-t border-[#cedbea] pt-7">
            <h3 className="erp-display-font text-xl font-bold uppercase tracking-[-0.02em] text-[#13213a]">Área comercial y atención</h3>
            <div className="mt-6 grid gap-x-12 gap-y-8 md:grid-cols-2">
              <article>
                <h4 className="text-base font-bold text-[#13213a]">LA SERNA, Lucas</h4>
                <p className="mt-1.5 text-sm font-medium text-[#53647d]">Director comercial</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold">
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="https://wa.me/5493512003500" rel="noreferrer" target="_blank"><span aria-hidden="true">◉</span> +54 9 351 200-3500</a>
                </div>
              </article>
              <article>
                <h4 className="text-base font-bold text-[#13213a]">Atención al cliente</h4>
                <p className="mt-1.5 text-sm font-medium text-[#53647d]">Consultas, pedidos y seguimiento</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold">
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="mailto:starlimmsas@gmail.com"><span aria-hidden="true">✉</span> starlimmsas@gmail.com</a>
                  <a className="inline-flex w-fit items-center gap-2 text-[#1769e8] hover:text-[#0a47ad] hover:underline" href="https://wa.me/5493543683594" rel="noreferrer" target="_blank"><span aria-hidden="true">◉</span> +54 9 3543 68-3594</a>
                </div>
              </article>
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-3 border-t border-[#cedbea] pt-6 text-sm font-semibold text-[#68778e] sm:flex-row sm:items-center sm:justify-between">
            <span>Starlim SAS · Córdoba, Argentina</span>
            <a className="text-[#1769e8] hover:underline" href="#acceso">Acceso al sistema ↑</a>
          </div>
        </div>
      </section>
    </main>
  );
}
