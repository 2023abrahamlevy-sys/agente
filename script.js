// Configuración
// Configuración de seguridad y tiempos.
const TIEMPO_LIMITE = 30000;
const ESPERA_ENTRE_ENVIOS = 1500;
const LIMITE_CARACTERES = 500;
const CLAVE_SESION = "promptin_session_id";

// Elementos principales del DOM.
const formulario = document.getElementById("formulario-chat");
const entrada = document.getElementById("entrada-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const textoBoton = document.getElementById("texto-boton");
const mensajes = document.getElementById("mensajes");
const contador = document.getElementById("contador");

// Estados de la aplicación.
let enviando = false;
let ultimoEnvio = 0;
let estadoActual = "éxito";

// Genera un identificador único.
function generarSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `sesion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Recupera o crea una sesión y la guarda.
function obtenerSessionId() {
  try {
    const guardado = localStorage.getItem(CLAVE_SESION);

    if (guardado) return guardado;

    const nuevo = generarSessionId();
    localStorage.setItem(CLAVE_SESION, nuevo);

    return nuevo;
  } catch (error) {
    // Si no hay almacenamiento, se usa una sesión en memoria.
    return generarSessionId();
  }
}

// Se genera una sola vez al iniciar la aplicación.
const sessionId = obtenerSessionId();

// Actualiza el contador de caracteres.
entrada.addEventListener("input", () => {
  contador.textContent = `${entrada.value.length}/${LIMITE_CARACTERES}`;
});

// Enter envía; Shift + Enter agrega una nueva línea.
entrada.addEventListener("keydown", (evento) => {
  if (
    evento.key === "Enter" &&
    !evento.shiftKey &&
    !evento.isComposing
  ) {
    evento.preventDefault();

    if (!formulario.requestSubmit) return;
    formulario.requestSubmit();
  }
});

// Devuelve la hora actual para cada mensaje.
function obtenerHora() {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

// Crea mensajes sin interpretar el contenido como HTML.
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

// Muestra un indicador mientras el agente responde.
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

// Comprueba si la URL está configurada.
function webhookConfigurado() {
  const url = String(WEBHOOK_URL || "").trim().toLowerCase();

  return (
    url !== "" &&
    !url.includes("aca va") &&
    !url.includes("ejemplo-webhook-prueba")
  );
}

// Extrae la respuesta de Make.
function extraerRespuesta(texto) {
  if (texto === "") {
    return "(respuesta vacía)";
  }

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

        if (typeof valor === "string" && valor.trim() !== "") {
          return valor;
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    // Acepta números, booleanos, listas y otros valores JSON.
    return texto;
  } catch (error) {
    // También acepta respuestas de texto como Accepted.
    return texto;
  }
}

// Comprueba la URL antes de enviar.
if (!webhookConfigurado()) {
  estadoActual = "error";
}

// Envía la consulta y gestiona los estados.
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const consulta = entrada.value.trim();

  if (!consulta || enviando) return;

  // Valida el límite de caracteres.
  if (consulta.length > LIMITE_CARACTERES) {
    estadoActual = "error";
    agregarMensaje(
      "El mensaje no puede superar los 500 caracteres.",
      "error"
    );
    return;
  }

  // Comprueba que exista una URL válida.
  if (!webhookConfigurado()) {
    estadoActual = "error";
    agregarMensaje(
      "Falta pegar la URL de tu webhook en config.js",
      "error"
    );
    return;
  }

  // Evita envíos demasiado seguidos.
  const ahora = Date.now();

  if (ahora - ultimoEnvio < ESPERA_ENTRE_ENVIOS) {
    return;
  }

  ultimoEnvio = ahora;
  enviando = true;
  estadoActual = "cargando";

  // Bloquea los controles durante el envío.
  botonEnviar.disabled = true;
  entrada.disabled = true;
  textoBoton.textContent = "Enviando...";

  agregarMensaje(consulta, "usuario");

  entrada.value = "";
  contador.textContent = `0/${LIMITE_CARACTERES}`;

  const indicador = mostrarCargando();
  const controlador = new AbortController();

  let tiempoAgotado = false;

  const temporizador = setTimeout(() => {
    tiempoAgotado = true;
    controlador.abort();
  }, TIEMPO_LIMITE);

  try {
    // Prepara los tres campos exactos para Make.
    const datos = {
      sessionId,
      mensaje: consulta,
      fecha: new Date().toISOString()
    };

    // Envía la consulta mediante POST.
    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(datos),
      signal: controlador.signal
    });

    // Siempre lee la respuesta como texto.
    const textoRecibido = await respuesta.text();

    if (!respuesta.ok) {
      throw new Error(
        `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`
      );
    }

    const textoRespuesta = extraerRespuesta(textoRecibido);

    estadoActual = "éxito";

    indicador.remove();
    agregarMensaje(textoRespuesta, "agente");

  } catch (error) {
    estadoActual = "error";

    indicador.remove();

    let mensajeError;

    if (tiempoAgotado || error.name === "AbortError") {
      mensajeError =
        "La consulta tardó demasiado. Intentá nuevamente.";
    } else if (error instanceof TypeError) {
      mensajeError =
        "No se pudo conectar con Make. Revisá tu conexión e intentá nuevamente.";
    } else if (error.message.startsWith("Make respondió con error")) {
      mensajeError = error.message;
    } else {
      mensajeError =
        "Ocurrió un error inesperado al procesar la respuesta. Intentá nuevamente.";
    }

    agregarMensaje(mensajeError, "error");

    console.error("Error en la consulta:", error);

  } finally {
    // Limpia el temporizador y restablece siempre la interfaz.
    clearTimeout(temporizador);

    if (indicador.isConnected) {
      indicador.remove();
    }

    enviando = false;
    botonEnviar.disabled = false;
    entrada.disabled = false;
    textoBoton.textContent = "Enviar";

    entrada.focus();
  }
});
 de seguridad y tiempos.
