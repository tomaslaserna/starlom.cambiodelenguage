//--------------------------Dark mode

const toggle = document.getElementById("dark-mode-toggle");

// 1. Lógica de inicio (Detectar preferencia)
let modoGuardado = localStorage.getItem("modoOscuro");

if (modoGuardado === "activo" || (modoGuardado === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add("dark-mode");
    toggle.src = "../imagenesIndex/sol.png";
} else {
    document.body.classList.remove("dark-mode");
    toggle.src = "../imagenesIndex/luna.png";
}

// 2. Función única para cambiar el modo
function cambiarModo() {
    const esOscuro = document.body.classList.toggle("dark-mode");
    if (esOscuro) {
        localStorage.setItem("modoOscuro", "activo");
        toggle.src = "../imagenesIndex/sol.png";
    } else {
        localStorage.setItem("modoOscuro", "inactivo");
        toggle.src = "../imagenesIndex/luna.png";
    }
}

// 3. Evento de click ÚNICO con la onda expansiva
toggle.addEventListener("click", function(event) {
    // Si el navegador no soporta la onda, cambia normal
    if (!document.startViewTransition) {
        cambiarModo();
        return;
    }

    // Coordenadas para la onda
    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    // Ejecutar la transición
    const transition = document.startViewTransition(() => {
        cambiarModo(); // Solo se llama una vez aquí dentro
    });

    transition.ready.then(() => {
        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 600,
                easing: "ease-in-out",
                pseudoElement: "::view-transition-new(root)",
            }
        );
    });
});

//-------------------------------------------

window.addEventListener("beforeunload", () => {
    document.documentElement.classList.add("cambio-pagina");
});

// Detectar clics en enlaces para activar el deslizamiento de página
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href && !link.target) {
        // Añadimos la clase solo cuando vamos a otra página
        document.documentElement.classList.add('cambio-pagina');
    }
});

// Asegurarnos de limpiar la clase al cargar la página
window.addEventListener('pageshow', () => {
    document.documentElement.classList.remove('cambio-pagina');
});

