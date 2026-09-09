"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  STARLIM_CHALLENGE_RADIUS_KM,
  STARLIM_CHALLENGE_SECONDS,
  STARLIM_CHALLENGE_STORAGE_KEY,
  starlimChallengeDistanceKm,
  type StarlimChallengeSession,
} from "@/lib/starlim-challenge";

export function LandingChallenge() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState("");

  function validateLocation() {
    setError("");
    if (!navigator.geolocation) { setError("Tu navegador no permite validar la ubicación."); return; }
    setChecking(true);
    navigator.geolocation.getCurrentPosition(({ coords: position }) => {
      const next = { latitude: position.latitude, longitude: position.longitude };
      if (starlimChallengeDistanceKm(next.latitude, next.longitude) > STARLIM_CHALLENGE_RADIUS_KM) {
        setError("Esta ubicación está fuera del área aproximada del Desafío Starlim.");
      } else setCoords(next);
      setChecking(false);
    }, () => { setError("Necesitamos permiso de ubicación para activar el desafío."); setChecking(false); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coords) return;
    const form = new FormData(event.currentTarget);
    const startedAt = Date.now();
    const session: StarlimChallengeSession = {
      startedAt,
      expiresAt: startedAt + STARLIM_CHALLENGE_SECONDS * 1000,
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      businessName: String(form.get("businessName") ?? "").trim(),
    };
    sessionStorage.setItem(STARLIM_CHALLENGE_STORAGE_KEY, JSON.stringify(session));
    router.push("/tienda?challenge=1");
  }

  return <section className="border-y border-[#ffac58] bg-[linear-gradient(115deg,#54140d,#a42416_55%,#ef6c20)] px-5 py-12 text-white sm:px-8 lg:px-12">
    <div className="mx-auto grid max-w-[1240px] items-center gap-7 lg:grid-cols-[1fr_420px]">
      <div><span className="text-xs font-black uppercase tracking-[.16em] text-[#ffd29a]">Entrega garantizada</span><h2 className="mt-3 text-[clamp(2.2rem,5vw,4.5rem)] font-black leading-none tracking-[-.055em]">Desafío Starlim</h2><p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-white/85">Validá tu zona, dejá tus datos y tenés 20 minutos para armar un pedido desde $150.000. Si después de confirmarlo no llega en 24 horas hábiles, recibís 20% OFF.</p></div>
      <div className="rounded-[24px] border border-white/25 bg-white/10 p-5 backdrop-blur sm:p-6">
        {!coords ? <><button className="challenge-flame-button min-h-16 w-full rounded-full bg-[#ffb13b] px-6 text-xl font-black text-[#4c1908]" disabled={checking} onClick={validateLocation} type="button">{checking ? "Validando ubicación…" : "🔥 Activar desafío"}</button><p className="mt-4 text-center text-sm font-semibold text-white/75">Área aproximada: Córdoba y alrededores dentro de 18 km.</p></>
        : <form className="grid gap-3" onSubmit={begin}><strong className="text-xl font-black">Tu ubicación está habilitada</strong><p className="text-sm text-white/75">Dejanos estos datos para iniciar los 20 minutos.</p><input className="min-h-12 rounded-xl bg-white px-4 font-semibold text-[#172033]" name="name" placeholder="Nombre y apellido" required /><input className="min-h-12 rounded-xl bg-white px-4 font-semibold text-[#172033]" name="phone" placeholder="WhatsApp o teléfono" required /><input className="min-h-12 rounded-xl bg-white px-4 font-semibold text-[#172033]" name="businessName" placeholder="Nombre del negocio (opcional)" /><button className="challenge-flame-button mt-2 min-h-14 rounded-full bg-[#ffb13b] px-5 font-black text-[#4c1908]" type="submit">Comenzar mi pedido →</button></form>}
        {error ? <p className="mt-4 rounded-xl bg-white p-3 text-sm font-bold text-[#a32618]">{error}</p> : null}
      </div>
    </div>
  </section>;
}
