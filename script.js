// Configuración de seguridad y tiempos.
const TIEMPO_LIMITE = 30000;
const ESPERA_ENTRE_ENVIOS = 1000;

// Elementos principales del DOM.
const formulario = document.getElementById("formulario-chat");
const entrada = document.getElementById("entrada-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const textoBoton = document.getElementById("texto-boton");
const mensajes = document.getElementById("mensajes");
const contador = document.getElementById("contador");

let enviando = false;
let ultimoEnvio = 0;

// Actualiza el contador de caracteres.
entrada.addEventListener("input", () => {
  contador.textContent = `${entrada.value.length}/4000`;
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

// Acepta formatos habituales de respuesta del webhook.
function extraerRespuesta(datos) {
  if (typeof datos === "string" && datos.trim()) {
    return datos.trim();
  }

  if (datos && typeof datos === "object") {
    const respuesta =
      datos.respuesta ??
      datos.answer ??
      datos.message ??
      datos.output;

    if (typeof respuesta === "string" && respuesta.trim()) {
      return respuesta.trim();
    }
  }

  throw new Error("La respuesta recibida no tiene un formato válido.");
}

// Envía la consulta y gestiona los estados de la interfaz.
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const consulta = entrada.value.trim();
  if (!consulta || enviando) return;

  // Evita envíos demasiado seguidos.
  const ahora = Date.now();
  if (ahora - ultimoEnvio < ESPERA_ENTRE_ENVIOS) return;
  ultimoEnvio = ahora;

  // Verifica que exista una URL de webhook configurada.
  if (
    !WEBHOOK_URL ||
    WEBHOOK_URL.includes("ejemplo-webhook-prueba")
  ) {
    agregarMensaje(
      "La interfaz está lista, pero falta configurar la URL real del webhook.",
      "error"
    );
    return;
  }

  enviando = true;
  botonEnviar.disabled = true;
  textoBoton.textContent = "Enviando...";
  entrada.disabled = true;

  agregarMensaje(consulta, "usuario");
  entrada.value = "";
  contador.textContent = "0/4000";

  const indicador = mostrarCargando();
  const controlador = new AbortController();
  const temporizador = setTimeout(
    () => controlador.abort(),
    TIEMPO_LIMITE
  );

  try {
    // Envía el texto al webhook mediante POST.
    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        mensaje: consulta,
        agente: "Consultor médico"
      }),
      signal: controlador.signal
    });

    if (!respuesta.ok) {
      throw new Error(`El servidor respondió con error ${respuesta.status}.`);
    }

    const tipoContenido = respuesta.headers.get("content-type") || "";
    let datos;

    if (tipoContenido.includes("application/json")) {
      datos = await respuesta.json();
    } else {
      datos = await respuesta.text();
    }

    const textoRespuesta = extraerRespuesta(datos);

    indicador.remove();
    agregarMensaje(textoRespuesta, "agente");
  } catch (error) {
    indicador.remove();

    const mensajeError = error.name === "AbortError"
      ? "La consulta tardó demasiado. Intentá nuevamente."
      : "No pudimos obtener una respuesta. Revisá la conexión y la configuración del webhook.";

    agregarMensaje(mensajeError, "error");
    console.error("Error en la consulta:", error);
  } finally {
    clearTimeout(temporizador);

    enviando = false;
    botonEnviar.disabled = false;
    entrada.disabled = false;
    textoBoton.textContent = "Enviar";
    entrada.focus();
  }
});
