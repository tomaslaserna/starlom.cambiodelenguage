(function () {
    var authCard = document.querySelector(".auth-card");
    var loginForm = document.querySelector(".formulario__login");
    var registerForm = document.querySelector(".formulario__register");
    var switches = document.querySelectorAll("[data-auth-switch]");
    var passwordToggles = document.querySelectorAll("[data-toggle-password]");
    var forms = document.querySelectorAll(".auth-form");

    function setMode(mode, focusFirstField) {
        var showRegister = mode === "register";
        if (authCard) authCard.setAttribute("data-mode", showRegister ? "register" : "login");
        if (loginForm) loginForm.hidden = showRegister;
        if (registerForm) registerForm.hidden = !showRegister;

        var activeForm = showRegister ? registerForm : loginForm;
        if (activeForm && focusFirstField !== false) {
            var firstInput = activeForm.querySelector("input");
            if (firstInput) firstInput.focus({ preventScroll: true });
        }
    }

    if (authCard) {
        setMode(authCard.getAttribute("data-mode") || "login", false);
    }

    switches.forEach(function (button) {
        button.addEventListener("click", function () {
            setMode(button.getAttribute("data-auth-switch"), true);
        });
    });

    passwordToggles.forEach(function (button) {
        button.addEventListener("click", function () {
            var input = document.getElementById(button.getAttribute("data-toggle-password"));
            if (!input) return;

            var visible = input.type === "text";
            input.type = visible ? "password" : "text";
            button.setAttribute("aria-pressed", visible ? "false" : "true");
            button.setAttribute("aria-label", visible ? "Mostrar contrasena" : "Ocultar contrasena");
            input.focus({ preventScroll: true });
        });
    });

    forms.forEach(function (form) {
        form.addEventListener("submit", function (event) {
            form.classList.add("was-validated");

            if (!form.checkValidity()) {
                event.preventDefault();
                var invalid = form.querySelector(":invalid");
                if (invalid) invalid.focus();
                return;
            }

            var submit = form.querySelector(".auth-submit");
            if (!submit) return;

            submit.dataset.originalText = submit.textContent;
            submit.textContent = submit.getAttribute("data-loading-text") || submit.textContent;
            submit.disabled = true;
        });
    });
})();
