// Light mode only. Legacy dark-mode controls are removed on load.
document.body.classList.remove("dark-mode");
document.documentElement.classList.remove("dark-mode");

try {
    localStorage.removeItem("modoOscuro");
} catch (_) {}

document.querySelectorAll("#dark-mode-toggle").forEach((toggle) => {
    const wrap = toggle.closest(".menu-sol");
    if (wrap) wrap.remove();
    else toggle.remove();
});

window.addEventListener("beforeunload", () => {
    document.documentElement.classList.add("cambio-pagina");
});

document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link && link.href && !link.target) {
        document.documentElement.classList.add("cambio-pagina");
    }
});

window.addEventListener("pageshow", () => {
    document.documentElement.classList.remove("cambio-pagina");
});
