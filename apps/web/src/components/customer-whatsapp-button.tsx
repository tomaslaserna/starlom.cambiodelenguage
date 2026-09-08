export function CustomerWhatsAppButton() {
  const message = encodeURIComponent("Hola Starlim, necesito ayuda con productos o con mi pedido.");
  return (
    <a
      aria-label="Hablar con atención al cliente por WhatsApp"
      className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-[0_10px_30px_rgba(17,94,55,.35)] transition hover:-translate-y-1 hover:bg-[#20bd5a] focus:outline-none focus:ring-4 focus:ring-[#25d366]/30"
      href={`https://wa.me/5493512003500?text=${message}`}
      rel="noreferrer"
      target="_blank"
      title="¿Necesitás ayuda? Escribinos por WhatsApp"
    >
      <svg aria-hidden="true" className="size-7" fill="currentColor" viewBox="0 0 32 32">
        <path d="M16 3a13 13 0 0 0-11.1 19.8L3.2 29l6.4-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-3.9-.5-5.5-1.5l-.4-.2-3.8 1 1-3.7-.2-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-1.9-.9-3.2-1.7-4.4-3.9-.3-.5.3-.5.9-1.7.1-.2.1-.4 0-.6l-1-2.5c-.3-.6-.6-.5-.8-.5h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.5 3.8 6 5.3 2.2.9 3 .9 4.1.8.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.3.2-1.5-.2-.2-.5-.3-.8-.4Z" />
      </svg>
    </a>
  );
}
