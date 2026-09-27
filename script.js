(() => {
  "use strict";

  /* =========================================================
     Utilidades
     ========================================================= */

  const STORAGE_KEY_MEDIA = "notapro:media:v1";
  const STORAGE_KEY_NECESITO = "notapro:necesito:v1";

  let rowIdCounter = 1;
  const newRowId = () => "r" + rowIdCounter++;

  /**
   * Convierte texto de un input a número, aceptando coma o punto
   * como separador decimal. Devuelve null si no es un número válido.
   */
  function parseNumber(raw) {
    if (raw == null) return null;
    const cleaned = String(raw).trim().replace(",", ".");
    if (cleaned === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function formatNumber(n) {
    // Muestra hasta 2 decimales, sin ceros sobrantes.
    return (Math.round(n * 100) / 100).toString().replace(".", ",");
  }

  function safeGetStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function safeSetStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // localStorage no disponible (modo privado, cuota, etc.).
      // La app sigue funcionando, simplemente no persiste.
    }
  }

  /* =========================================================
     Fábrica de un "tema" (media ponderada / qué nota necesito)
     Ambas pestañas comparten la misma mecánica de filas,
     así que se genera con una función reutilizable.
     ========================================================= */

  function createRowsController(cfg) {
    const tbody = document.getElementById(cfg.tbodyId);
    const errorEl = document.getElementById(cfg.errorId);
    const template = document.getElementById("row-template");

    let rows = []; // { id, nombre, nota, peso }

    function loadFromStorage() {
      const saved = safeGetStorage(cfg.storageKey);
      if (saved && Array.isArray(saved.rows) && saved.rows.length) {
        rows = saved.rows.map((r) => ({
          id: newRowId(),
          nombre: r.nombre || "",
          nota: r.nota ?? "",
          peso: r.peso ?? "",
        }));
      } else {
        rows = [makeEmptyRow(), makeEmptyRow()];
      }
    }

    function makeEmptyRow() {
      return { id: newRowId(), nombre: "", nota: "", peso: "" };
    }

    function persist() {
      safeSetStorage(cfg.storageKey, {
        rows: rows.map(({ nombre, nota, peso }) => ({ nombre, nota, peso })),
      });
    }

    function addRow() {
      rows.push(makeEmptyRow());
      render();
      persist();
      // Foco en el nombre de la fila recién creada.
      const last = tbody.querySelector(".grade-row:last-child .input-nombre");
      if (last) last.focus();
    }

    function removeRow(id) {
      if (rows.length <= 1) {
        rows = [makeEmptyRow()];
      } else {
        rows = rows.filter((r) => r.id !== id);
      }
      render();
      persist();
    }

    function resetAll() {
      rows = [makeEmptyRow(), makeEmptyRow()];
      errorEl.textContent = "";
      render();
      persist();
      cfg.onChange();
    }

    function render() {
      tbody.innerHTML = "";
      rows.forEach((row, index) => {
        const frag = template.content.cloneNode(true);
        const tr = frag.querySelector(".grade-row");
        tr.dataset.id = row.id;
        tr.querySelector(".row-index").textContent = index + 1;

        const nombreInput = tr.querySelector(".input-nombre");
        const notaInput = tr.querySelector(".input-nota");
        const pesoInput = tr.querySelector(".input-peso");
        nombreInput.value = row.nombre;
        notaInput.value = row.nota;
        pesoInput.value = row.peso;
        nombreInput.placeholder = cfg.nombrePlaceholder;

        nombreInput.addEventListener("input", () => {
          row.nombre = nombreInput.value;
          persist();
        });
        notaInput.addEventListener("input", () => {
          row.nota = notaInput.value;
          persist();
          cfg.onChange();
        });
        pesoInput.addEventListener("input", () => {
          row.peso = pesoInput.value;
          persist();
          cfg.onChange();
        });

        tr.querySelector(".btn-remove-row").addEventListener("click", () => {
          removeRow(row.id);
          cfg.onChange();
        });

        tbody.appendChild(frag);
      });
    }

    /**
     * Valida las filas y devuelve { ok, entries, message }.
     * entries: lista de { nombre, nota, peso } numéricos válidos
     * (solo se cuentan filas que tienen al menos nota o peso rellenos;
     * las filas totalmente vacías se ignoran sin generar error).
     */
    function getValidatedEntries() {
      const entries = [];
      let hasAnyInput = false;
      let message = "";

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nombreVacio = r.nombre.trim() === "";
        const notaVacia = String(r.nota).trim() === "";
        const pesoVacio = String(r.peso).trim() === "";

        if (nombreVacio && notaVacia && pesoVacio) {
          continue; // fila totalmente vacía, se ignora
        }
        hasAnyInput = true;

        const nota = parseNumber(r.nota);
        const peso = parseNumber(r.peso);
        const etiqueta = r.nombre.trim() || `Fila ${i + 1}`;

        if (nota === null) {
          message = `Revisa la nota de "${etiqueta}": debe ser un número entre 0 y 10.`;
          continue;
        }
        if (nota < 0 || nota > 10) {
          message = `La nota de "${etiqueta}" debe estar entre 0 y 10.`;
          continue;
        }
        if (peso === null) {
          message = `Revisa el peso de "${etiqueta}": debe ser un número entre 0 y 100.`;
          continue;
        }
        if (peso < 0 || peso > 100) {
          message = `El peso de "${etiqueta}" debe estar entre 0 y 100.`;
          continue;
        }

        entries.push({ nombre: etiqueta, nota, peso });
      }

      if (message) {
        return { ok: false, entries: [], message, hasAnyInput };
      }
      return { ok: true, entries, message: "", hasAnyInput };
    }

    loadFromStorage();

    return {
      render,
      addRow,
      resetAll,
      getValidatedEntries,
      errorEl,
    };
  }

  /* =========================================================
     TAB 1 — Media ponderada
     ========================================================= */

  const mediaResultEl = document.getElementById("media-result");
  const mediaStatusEl = document.getElementById("media-status");
  const mediaTotalPesoEl = document.getElementById("media-total-peso");

  const mediaCtrl = createRowsController({
    tbodyId: "media-rows",
    errorId: "media-error",
    storageKey: STORAGE_KEY_MEDIA,
    nombrePlaceholder: "Ej. Matemáticas",
    onChange: computeMedia,
  });

  function computeMedia() {
    const { ok, entries, message, hasAnyInput } = mediaCtrl.getValidatedEntries();

    if (!ok) {
      mediaCtrl.errorEl.textContent = message;
      return;
    }
    mediaCtrl.errorEl.textContent = "";

    if (!hasAnyInput || entries.length === 0) {
      setResult(mediaResultEl, "—", "");
      mediaStatusEl.textContent = "Añade una asignatura para empezar.";
      mediaTotalPesoEl.textContent = "0%";
      return;
    }

    const totalPeso = entries.reduce((s, e) => s + e.peso, 0);
    mediaTotalPesoEl.textContent = formatNumber(totalPeso) + "%";

    if (totalPeso === 0) {
      setResult(mediaResultEl, "—", "");
      mediaStatusEl.textContent = "Añade al menos un peso mayor que 0 para calcular la media.";
      return;
    }

    const media = entries.reduce((s, e) => s + e.nota * e.peso, 0) / totalPeso;
    const cls = media >= 5 ? "state-good" : "state-bad";
    setResult(mediaResultEl, formatNumber(media), cls);

    let status = media >= 5 ? "Vas aprobando de media." : "De momento la media está en suspenso.";
    if (Math.abs(totalPeso - 100) > 0.01) {
      status += ` Los pesos suman ${formatNumber(totalPeso)}%, no 100% — la media se calcula igualmente de forma proporcional.`;
    }
    mediaStatusEl.textContent = status;
  }

  document.getElementById("media-add").addEventListener("click", () => {
    mediaCtrl.addRow();
    computeMedia();
  });

  document.getElementById("media-reset").addEventListener("click", () => {
    const confirmado = window.confirm("¿Seguro que quieres borrar todas las asignaturas?");
    if (!confirmado) return;
    mediaCtrl.resetAll();
  });

  /* =========================================================
     TAB 2 — ¿Qué nota necesito?
     ========================================================= */

  const necesitoResultEl = document.getElementById("necesito-result");
  const necesitoStatusEl = document.getElementById("necesito-status");
  const necesitoPesoUsadoEl = document.getElementById("necesito-peso-usado");
  const necesitoPesoRestanteEl = document.getElementById("necesito-peso-restante");
  const objetivoInput = document.getElementById("objetivo-input");
  const necesitoErrorEl = document.getElementById("necesito-error");

  const necesitoCtrl = createRowsController({
    tbodyId: "necesito-rows",
    errorId: "necesito-error",
    storageKey: STORAGE_KEY_NECESITO,
    nombrePlaceholder: "Ej. Examen 1",
    onChange: computeNecesito,
  });

  function loadObjetivo() {
    const saved = safeGetStorage(STORAGE_KEY_NECESITO + ":objetivo");
    if (saved && typeof saved.value === "string") {
      objetivoInput.value = saved.value;
    }
  }

  function persistObjetivo() {
    safeSetStorage(STORAGE_KEY_NECESITO + ":objetivo", { value: objetivoInput.value });
  }

  function computeNecesito() {
    const { ok, entries, message } = necesitoCtrl.getValidatedEntries();

    if (!ok) {
      necesitoErrorEl.textContent = message;
      return;
    }

    const objetivoRaw = objetivoInput.value;
    const objetivoVacio = objetivoRaw.trim() === "";
    const objetivo = parseNumber(objetivoRaw);

    if (!objetivoVacio && (objetivo === null || objetivo < 0 || objetivo > 10)) {
      necesitoErrorEl.textContent = "La nota objetivo debe ser un número entre 0 y 10.";
      return;
    }

    necesitoErrorEl.textContent = "";

    const pesoUsado = entries.reduce((s, e) => s + e.peso, 0);
    const pesoRestante = 100 - pesoUsado;
    necesitoPesoUsadoEl.textContent = formatNumber(pesoUsado) + "%";
    necesitoPesoRestanteEl.textContent = formatNumber(Math.max(pesoRestante, 0)) + "%";

    if (entries.length === 0 && objetivoVacio) {
      setResult(necesitoResultEl, "—", "");
      necesitoStatusEl.textContent = "Añade tus partes calificadas y una nota objetivo.";
      return;
    }

    if (objetivoVacio) {
      setResult(necesitoResultEl, "—", "");
      necesitoStatusEl.textContent = "Escribe la nota objetivo que quieres alcanzar.";
      return;
    }

    if (pesoUsado > 100) {
      setResult(necesitoResultEl, "—", "state-bad");
      necesitoStatusEl.textContent = `Los pesos ya suman ${formatNumber(pesoUsado)}%, más de 100%. Revisa los pesos introducidos.`;
      return;
    }

    if (pesoRestante <= 0) {
      // pesoUsado === 100 exactamente: ya está todo decidido.
      const puntosActuales = entries.reduce((s, e) => s + e.nota * e.peso, 0) / 100;
      const cls = puntosActuales >= objetivo ? "state-good" : "state-bad";
      setResult(necesitoResultEl, formatNumber(puntosActuales), cls);
      necesitoStatusEl.textContent =
        puntosActuales >= objetivo
          ? "Ya has completado el 100% del peso y alcanzas el objetivo."
          : "Ya has completado el 100% del peso y no llegas al objetivo.";
      return;
    }

    const puntosLogrados = entries.reduce((s, e) => s + e.nota * e.peso, 0);
    const necesaria = (objetivo * 100 - puntosLogrados) / pesoRestante;

    if (necesaria <= 0) {
      setResult(necesitoResultEl, "0", "state-good");
      necesitoStatusEl.textContent = "Ya has alcanzado tu objetivo con lo que llevas hasta ahora.";
      return;
    }

    if (necesaria > 10) {
      setResult(necesitoResultEl, formatNumber(necesaria), "state-bad");
      necesitoStatusEl.textContent = "No es posible alcanzar ese objetivo con el peso restante: necesitarías más de un 10.";
      return;
    }

    const cls = necesaria <= 10 ? (necesaria <= 5 ? "state-good" : "") : "state-bad";
    setResult(necesitoResultEl, formatNumber(necesaria), cls);
    necesitoStatusEl.textContent = `Necesitas al menos un ${formatNumber(necesaria)} en el ${formatNumber(
      pesoRestante
    )}% que te queda.`;
  }

  objetivoInput.addEventListener("input", () => {
    persistObjetivo();
    computeNecesito();
  });

  document.getElementById("necesito-add").addEventListener("click", () => {
    necesitoCtrl.addRow();
    computeNecesito();
  });

  document.getElementById("necesito-reset").addEventListener("click", () => {
    const confirmado = window.confirm("¿Seguro que quieres borrar todas las partes y el objetivo?");
    if (!confirmado) return;
    objetivoInput.value = "";
    persistObjetivo();
    necesitoCtrl.resetAll();
    computeNecesito();
  });

  /* =========================================================
     Ayudante de resultado (número grande + animación discreta)
     ========================================================= */

  function setResult(el, text, cls) {
    el.classList.remove("state-good", "state-bad", "pop");
    if (cls) el.classList.add(cls);
    el.textContent = text;
    // Fuerza reflow para poder reiniciar la animación.
    void el.offsetWidth;
    el.classList.add("pop");
  }

  /* =========================================================
     Pestañas (tablist accesible con flechas de teclado)
     ========================================================= */

  const tabButtons = [
    { btn: document.getElementById("tab-btn-media"), panel: document.getElementById("tab-media") },
    { btn: document.getElementById("tab-btn-necesito"), panel: document.getElementById("tab-necesito") },
  ];

  function selectTab(index) {
    tabButtons.forEach((t, i) => {
      const active = i === index;
      t.btn.setAttribute("aria-selected", active ? "true" : "false");
      t.btn.tabIndex = active ? 0 : -1;
      t.panel.classList.toggle("is-hidden", !active);
    });
  }

  tabButtons.forEach((t, i) => {
    t.btn.addEventListener("click", () => selectTab(i));
    t.btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = (i + dir + tabButtons.length) % tabButtons.length;
        tabButtons[next].btn.focus();
        selectTab(next);
      }
    });
  });

  /* =========================================================
     Inicio
     ========================================================= */

  loadObjetivo();
  mediaCtrl.render();
  necesitoCtrl.render();
  computeMedia();
  computeNecesito();
})();
