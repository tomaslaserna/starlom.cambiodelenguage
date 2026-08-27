"use client";

import { useRef } from "react";

const reviews = [
  {
    author: "Maxi Berrotaran",
    quote: "Increíbles precios y los chicos muy atentos",
  },
  {
    author: "Matías Ferrer Puccio",
    quote: "Mejores precios de Villa Allende. Impecable todo y muy buen trato",
  },
  {
    author: "Fran Valdes",
    quote: "Buenos precios y productos de calidad",
  },
  {
    author: "Martina Fontanilla",
    quote: "¡Servicio de primera! ¡Y precios increíbles!",
  },
];

const GOOGLE_REVIEWS_URL =
  "https://www.google.com/maps/place/STARLIM+Casa+de+limpieza+y+descartables/@-31.3019953,-64.286034,17z/data=!3m1!4b1!4m6!3m5!1s0x94329d49fa509dbd:0x6ea6aceea60a742d!8m2!3d-31.3019999!4d-64.2834591!16s%2Fg%2F11w29hkvnj";

export function TestimonialsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  function move(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.min(track.clientWidth * 0.86, 420), behavior: "smooth" });
  }

  return (
    <section className="border-t border-[#dbe5f1] bg-white px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <span className="erp-display-font text-xs font-semibold uppercase tracking-[0.08em] text-[#1769e8]">Experiencias reales</span>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3.5rem)] font-bold leading-tight tracking-[-0.045em] text-[#13213a]">Lo que dicen quienes nos eligen.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#68778e]">Opiniones públicas verificadas sobre la atención, los productos y la propuesta de Starlim.</p>
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Ver opinión anterior" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#cbd9ea] bg-white text-xl font-bold text-[#174a92] shadow-sm transition hover:border-[#1769e8] hover:bg-[#f3f7ff]" onClick={() => move(-1)} type="button">←</button>
            <button aria-label="Ver opinión siguiente" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#cbd9ea] bg-white text-xl font-bold text-[#174a92] shadow-sm transition hover:border-[#1769e8] hover:bg-[#f3f7ff]" onClick={() => move(1)} type="button">→</button>
          </div>
        </div>

        <div className="mt-9 flex items-center gap-3 rounded-[16px] border border-[#dce7f4] bg-[#f7faff] px-5 py-4 sm:w-fit">
          <span className="erp-display-font text-2xl font-bold text-[#13213a]">4,8</span>
          <span aria-label="5 estrellas" className="tracking-[0.12em] text-[#f5a623]">★★★★★</span>
          <span className="text-sm font-semibold text-[#5f7088]">en Google</span>
        </div>

        <div aria-label="Testimonios de clientes" className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]" ref={trackRef}>
          {reviews.map((review) => (
            <article className="flex min-h-[250px] min-w-[86%] snap-start flex-col rounded-[20px] border border-[#dbe5f1] bg-[#fbfdff] p-6 shadow-[0_12px_32px_rgba(20,55,100,0.07)] sm:min-w-[360px] lg:min-w-[390px]" key={review.author}>
              <span aria-hidden="true" className="erp-display-font text-5xl font-bold leading-none text-[#1769e8]/25">“</span>
              <blockquote className="mt-3 text-lg font-semibold leading-8 text-[#23334d]">{review.quote}</blockquote>
              <div className="mt-auto pt-7">
                <p className="font-bold text-[#13213a]">{review.author}</p>
                <a className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[#1769e8] hover:underline" href={GOOGLE_REVIEWS_URL} rel="noreferrer" target="_blank">
                  <span aria-hidden="true">G</span> Reseña pública en Google
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[#68778e]">La ficha pública registra 8 opiniones: 4 con comentario y 4 valoraciones sin texto.</p>
          <div className="flex flex-wrap gap-4">
            <a className="text-[#1769e8] hover:underline" href={GOOGLE_REVIEWS_URL} rel="noreferrer" target="_blank">Ver todas en Google ↗</a>
            <a className="text-[#1769e8] hover:underline" href="https://www.instagram.com/starlimsas/" rel="noreferrer" target="_blank">Seguinos en Instagram ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}
