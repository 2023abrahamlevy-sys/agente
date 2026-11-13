
// Configuración de seguridad y tiempos.
const TIEMPO_LIMITE = 30000;
const ESPERA_ENTRE_ENVIOS = 1500;
const LIMITE_CARACTERES = 500;
const CLAVE_SESION = "promptin_session_id";

// Elementos del chat.
const formulario = document.getElementById("formulario-chat");
const entrada = document.getElementById("entrada-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const textoBoton = document.getElementById("texto-boton");
const mensajes = document.getElementById("mensajes");
const contador = document.getElementById("contador");

// Estados.
let enviando = false;
let ultimoEnvio = 0;
let estadoActual = "éxito";

// Genera un identificador de sesión.
function generarSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "sesion-" + Date.now() + "-" +
    Math.random().toString(36).substring(2);
}

// Recupera o crea la sesión.
function obtenerSessionId() {
  try {
    const guardado = localStorage.getItem(CLAVE_SESION);

    if (guardado) return guardado;

    const nuevo = generarSessionId();
    localStorage.setItem(CLAVE_SESION, nuevo);

    return nuevo;
  } catch (error) {
    return generarSessionId();
  }
}

// Una sola sesión para toda la aplicación.
const sessionId = obtenerSessionId();

// Contador de caracteres.
entrada.addEventListener("input", () => {
  contador.textContent =
    `${entrada.value.length}/${LIMITE_CARACTERES}`;
});

// Enter envía el mensaje.
entrada.addEventListener("keydown", (evento) => {
  if (
    evento.key === "Enter" &&
    !evento.shiftKey &&
    !evento.isComposing
  ) {
    evento.preventDefault();
    formulario.requestSubmit();
  }
});

// Hora de los mensajes.
function obtenerHora() {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

// Agrega mensajes al chat.
function agregarMensaje(texto, tipo = "agente") {
  const articulo = document.createElement("article");
  articulo.className = `mensaje mensaje-${tipo}`;

  if (tipo === "agente" || tipo === "error") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "✚";
    articulo.appendChild(avatar);
  }

  const burbuja = document.createElement("div");
  burbuja.className = "burbuja";

  const nombre = document.createElement("span");
  nombre.className = "nombre";

  nombre.textContent =
    tipo === "usuario" ? "Vos" :
    tipo === "error" ? "No se pudo completar" :
    "Consultor médico";

  const contenido = document.createElement("p");
  contenido.textContent = texto;

  const hora = document.createElement("time");
  hora.textContent = obtenerHora();
  hora.dateTime = new Date().toISOString();

  burbuja.append(nombre, contenido, hora);
  articulo.appendChild(burbuja);
  mensajes.appendChild(articulo);

  mensajes.scrollTop = mensajes.scrollHeight;

  return articulo;
}

// Indicador de carga.
function mostrarCargando() {
  const articulo = document.createElement("article");
  articulo.className = "mensaje mensaje-agente";
  articulo.id = "mensaje-cargando";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "✚";
  avatar.setAttribute("aria-hidden", "true");

  const burbuja = document.createElement("div");
  burbuja.className = "burbuja";

  const nombre = document.createElement("span");
  nombre.className = "nombre";
  nombre.textContent = "Consultor médico";

  const indicador = document.createElement("div");
  indicador.className = "indicador";
  indicador.setAttribute("role", "status");
  indicador.setAttribute("aria-label", "Generando respuesta");

  const texto = document.createElement("span");
  texto.textContent = "Preparando respuesta";

  indicador.appendChild(texto);

  for (let i = 0; i < 3; i++) {
    const punto = document.createElement("span");
    punto.className = "punto";
    indicador.appendChild(punto);
  }

  burbuja.append(nombre, indicador);
  articulo.append(avatar, burbuja);
  mensajes.appendChild(articulo);

  mensajes.scrollTop = mensajes.scrollHeight;

  return articulo;
}

// Comprueba la URL del webhook.
function webhookConfigurado() {
  const url = String(WEBHOOK_URL || "").trim().toLowerCase();

  return (
    url !== "" &&
    !url.includes("aca va") &&
    !url.includes("ejemplo-webhook-prueba")
  );
}

// Interpreta la respuesta de Make.
function extraerRespuesta(texto) {
  if (!texto) return "(respuesta vacía)";

  try {
    const datos = JSON.parse(texto);

    if (
      datos !== null &&
      typeof datos === "object" &&
      !Array.isArray(datos)
    ) {
      const campos = [
        "response",
        "respuesta",
        "message",
        "mensaje"
      ];

      for (const campo of campos) {
        const valor = datos[campo];

        if (
          typeof valor === "string" &&
          valor.trim() !== ""
        ) {
          return valor;
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    return texto;
  } catch (error) {
    return texto;
  }
}

// Envía los mensajes.
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (enviando) return;

  const consulta = entrada.value.trim();

  if (!consulta) return;

  // Validación del mensaje.
  if (consulta.length > LIMITE_CARACTERES) {
    estadoActual = "error";
    agregarMensaje(
      "El mensaje no puede superar los 500 caracteres.",
      "error"
    );
    return;
  }

  // Evita envíos demasiado seguidos.
  if (Date.now() - ultimoEnvio < ESPERA_ENTRE_ENVIOS) {
    return;
  }

  ultimoEnvio = Date.now();

  // Muestra el mensaje inmediatamente en el chat.
  agregarMensaje(consulta, "usuario");

  entrada.value = "";
  contador.textContent = `0/${LIMITE_CARACTERES}`;

  // Comprueba el webhook después de mostrar el mensaje.
  if (!webhookConfigurado()) {
    estadoActual = "error";
    agregarMensaje(
      "Falta pegar la URL de tu webhook en config.js",
      "error"
    );
    return;
  }

  // Activa el estado de carga.
  enviando = true;
  estadoActual = "cargando";

  botonEnviar.disabled = true;
  entrada.disabled = true;
  textoBoton.textContent = "Enviando...";

  const indicador = mostrarCargando();
  const controlador = new AbortController();

  let tiempoAgotado = false;

  const temporizador = setTimeout(() => {
    tiempoAgotado = true;
    controlador.abort();
  }, TIEMPO_LIMITE);

  try {
    // Datos exactos que recibe Make.
    const datos = {
      sessionId: sessionId,
      mensaje: consulta,
      fecha: new Date().toISOString()
    };

    // Envío al webhook.
    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(datos),
      signal: controlador.signal
    });

    // Lee siempre la respuesta como texto.
    const textoRecibido = await respuesta.text();

    if (!respuesta.ok) {
      throw new Error(
        `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`
      );
    }

    // Muestra la respuesta.
    const resultado = extraerRespuesta(textoRecibido);

    estadoActual = "éxito";

    indicador.remove();
    agregarMensaje(resultado, "agente");

  } catch (error) {
    estadoActual = "error";

    indicador.remove();

    let mensajeError;

    if (tiempoAgotado || error.name === "AbortError") {
      mensajeError =
        "La consulta tardó demasiado. Intentá nuevamente.";
    } else if (
      error.message.startsWith("Make respondió con error")
    ) {
      mensajeError = error.message;
    } else if (error instanceof TypeError) {
      mensajeError =
        "Falló la conexión con Make. Revisá tu conexión a Internet.";
    } else {
      mensajeError =
        "Ocurrió un error inesperado. Intentá nuevamente.";
    }

    agregarMensaje(mensajeError, "error");

    console.error("Error de Make:", error);

  } finally {
    // Siempre restablece la interfaz.
    clearTimeout(temporizador);

    indicador.remove();

    enviando = false;

    botonEnviar.disabled = false;
    entrada.disabled = false;
    textoBoton.textContent = "Enviar";

    entrada.focus();
  }
});
