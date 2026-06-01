import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfigSanare = {
  apiKey: "AIzaSyAX1AA7tTnlnApVZlnnuMkB42k3W5IlwoM",
  authDomain: "sanare-cotizador.firebaseapp.com",
  projectId: "sanare-cotizador",
  storageBucket: "sanare-cotizador.firebasestorage.app",
  messagingSenderId: "902613920907",
  appId: "1:902613920907:web:0e73bd5def3cf4396a788e"
};

const firebaseConfigNomad = {
  apiKey: "AIzaSyDhtKZlWpHdhFcnVzWovB93bRSVRkC1sDI",
  authDomain: "cotizador-nomad.firebaseapp.com",
  projectId: "cotizador-nomad",
  storageBucket: "cotizador-nomad.firebasestorage.app",
  messagingSenderId: "736481537624",
  appId: "1:736481537624:web:6f06667cf34bccc532642d"
};

const SANARE_COLLECTION = "cotizaciones";
const NOMAD_COLLECTION = "cotizaciones";
const EMBUDO_COLLECTION = "seguimiento_operativo";

const firebaseConfigEmbudo = {
  apiKey: "AIzaSyBqQywIlbMo9nSOC3zI3u7nRshs4rDedMM",
  authDomain: "embudo-innvida.firebaseapp.com",
  projectId: "embudo-innvida",
  storageBucket: "embudo-innvida.firebasestorage.app",
  messagingSenderId: "988847530129",
  appId: "1:988847530129:web:fd89909a969431df329f30"
};

const ESTATUS_1_OPCIONES = [
  "Sin seguimiento",
  "Cotización enviada",
  "En negociación",
  "Cerrada / aceptada",
  "Perdida / rechazada",
  "Cancelada"
];

const PAGO_OPCIONES = [
  "Pendiente de pago",
  "Anticipo recibido",
  "Pago confirmado",
  "Pago parcial",
  "Pago rechazado / no reflejado"
];

const PROGRAMACION_OPCIONES = [
  "Sin programación",
  "Por programar",
  "Programada",
  "Reprogramada",
  "Aplicada",
  "No aplicada / vencida"
];

const MAPA_SEDES_SANARE = {
  "722 197 08 36": "Toluca",
  "55 5255 8403": "Narvarte"
};

const appSanare = initializeApp(firebaseConfigSanare, "sanareApp");
const appNomad = initializeApp(firebaseConfigNomad, "nomadApp");
const appEmbudo = initializeApp(firebaseConfigEmbudo, "embudoApp");
const dbSanare = getFirestore(appSanare);
const dbNomad = getFirestore(appNomad);
const dbEmbudo = getFirestore(appEmbudo);

let sanareRows = [];
let nomadRows = [];
let embudoMap = new Map();
let allRows = [];
let filteredRows = [];
let selectedRow = null;
let chartEmbudo = null;
let chartMarca = null;

const chartValuePlugin = {
  id: "chartValuePlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const total = (chart.data.datasets[0] && chart.data.datasets[0].data || []).reduce((a, b) => a + Number(b || 0), 0) || 0;
    ctx.save();
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((element, index) => {
        const raw = Number(dataset.data[index] || 0);
        if (!raw) return;
        const pct = total ? ((raw / total) * 100).toFixed(1) : "0.0";
        const position = element.tooltipPosition();
        ctx.fillStyle = document.body.classList.contains("theme-light") ? "#17376c" : "#e8f0ff";
        ctx.font = "600 11px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        const label = chart.config.type === "doughnut" ? `${pct}%` : `${raw} · ${pct}%`;
        const yOffset = chart.config.type === "doughnut" ? 0 : -10;
        ctx.fillText(label, position.x, position.y + yOffset);
      });
    });
    ctx.restore();
  }
};
Chart.register(chartValuePlugin);

const $ = (id) => document.getElementById(id);

const THEME_KEY = "innvida-dashboard-theme";

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("theme-light", isLight);
  const btnTema = $("btnTema");
  if (btnTema) btnTema.textContent = isLight ? "Modo oscuro" : "Modo claro";
  localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  const btnTema = $("btnTema");
  if (btnTema) {
    btnTema.addEventListener("click", () => {
      const next = document.body.classList.contains("theme-light") ? "dark" : "light";
      applyTheme(next);
      renderCharts(filteredRows.length ? filteredRows : allRows);
    });
  }
}
const tbody = $("tablaCotizacionesBody");
const filtroFechaInicio = $("filtroFechaInicio");
const filtroFechaFin = $("filtroFechaFin");
const filtroTexto = $("filtroTexto");
const filtroStatus1 = $("filtroStatus1");
const filtroPago = $("filtroPago");
const filtroProgramacion = $("filtroProgramacion");
const filtroSede = $("filtroSede");
const filtrosMarca = Array.from(document.querySelectorAll(".filtro-marca"));
const drawer = $("drawer");
const drawerBackdrop = $("drawerBackdrop");


function setSaveStatus(message, type = "info") {
  const el = $("saveStatus");
  if (!el) return;
  el.textContent = message;
  el.className = `save-status ${type === "error" ? "" : "muted"}`.trim();
  if (type === "error") el.style.color = document.body.classList.contains("theme-light") ? "#991b1b" : "#fecaca";
  else if (type === "success") el.style.color = document.body.classList.contains("theme-light") ? "#065f46" : "#bbf7d0";
  else el.style.color = "";
}

let toastTimer = null;
function showToast(message, type = "success") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = "toast hidden", 2800);
}


function formatearMoneda(valor) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(valor || 0));
}

function formatNumber(valor) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Number(valor || 0));
}

function porcentaje(valor, total) {
  if (!total) return "0.0%";
  return `${((Number(valor || 0) / Number(total || 0)) * 100).toFixed(1)}%`;
}

function normalizarFecha(valor) {
  if (!valor) return "";
  if (typeof valor === "string") return valor.slice(0, 10);
  if (valor?.seconds) return new Date(valor.seconds * 1000).toISOString().slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return "";
}

function normalizarHora(valor) {
  if (!valor) return "";
  if (/^\d{2}:\d{2}$/.test(valor)) return valor;
  const match = String(valor).match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function normalizeMixedValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(item => normalizeMixedValue(item)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return value.nombre || value.name || value.descripcion || value.descripcionPrueba || value.prueba || value.tratamiento || value.label || value.text || Object.values(value).filter(v => typeof v !== "object").join(" ");
  }
  return String(value);
}

function obtenerSedePorTelefono(telefono) {
  if (!telefono) return "";
  return MAPA_SEDES_SANARE[String(telefono).trim()] || "Otra / sin clasificar";
}

function selectedValues(select) {
  return Array.from(select.options).filter(opt => opt.selected).map(opt => opt.value);
}

function setSelectOptions(select, options) {
  select.innerHTML = "";
  options.forEach(op => {
    const option = document.createElement("option");
    option.value = op;
    option.textContent = op;
    select.appendChild(option);
  });
}

function initFilters() {
  setSelectOptions(filtroStatus1, ESTATUS_1_OPCIONES);
  setSelectOptions(filtroPago, PAGO_OPCIONES);
  setSelectOptions(filtroProgramacion, PROGRAMACION_OPCIONES);

  const sedes = ["", "Narvarte", "Toluca", "Morelia", "Puebla", "Otra / sin clasificar"];
  filtroSede.innerHTML = sedes.map(s => `<option value="${s}">${s || "Todas"}</option>`).join("");
}

function mapSanareDoc(docSnap) {
  const data = docSnap.data();
  const payment = data.payment || {};
  const scheduling = data.scheduling || {};
  const total = Number(data.total || payment.montoPagado || 0);
  const telefono = data.telefono || "";
  const sede = scheduling.sede || obtenerSedePorTelefono(telefono);

  return {
    marca: "SANARE",
    collection: SANARE_COLLECTION,
    idFirestore: docSnap.id,
    folio: data.folio || docSnap.id,
    fechaEmision: normalizarFecha(data.fechaEmision || data.createdAt),
    paciente: data.paciente || "",
    medico: scheduling.medico || data.medico || "",
    kam: data.kam || "",
    aseguradora: data.aseguradora || "",
    telefono,
    sede,
    total,
    status1: data.status1 || "Sin seguimiento",
    pagoStatus: payment.status || (data.status1 === "Cerrada / aceptada" ? "Pendiente de pago" : "Pendiente de pago"),
    pagoFecha: normalizarFecha(payment.fechaPago),
    pagoMonto: Number(payment.montoPagado || total || 0),
    pagoMetodo: payment.metodo || "",
    pagoRegistradoPor: payment.registradoPor || "",
    pagoNotas: payment.notas || data.motivo || "",
    programacionStatus: scheduling.status || (data.status2 === "Programada" ? "Programada" : "Sin programación"),
    programacionFecha: normalizarFecha(scheduling.fechaInfusion || data.fechaProgramacion),
    programacionHora: normalizarHora(scheduling.horaCita),
    servicio: scheduling.servicio || "INFUSION",
    ciclo: scheduling.ciclo || data.ciclo || "",
    tipoTratamiento: scheduling.tipoTratamiento || data.tipoTratamiento || "",
    tratamiento: normalizeMixedValue(scheduling.tratamiento || data.esquema || data.tratamiento || ""),
    diagnostico: normalizeMixedValue(scheduling.diagnostico || data.dx || ""),
    programadoPor: scheduling.programadoPor || "",
    programacionNotas: scheduling.notas || "",
    direccion: data.direccion || "",
    sourceProject: "sanare-cotizador",
    sourceCollection: SANARE_COLLECTION,
    sourceDocId: docSnap.id,
    origenData: data
  };
}

function mapNomadDoc(docSnap) {
  const data = docSnap.data();
  const payment = data.payment || {};
  const scheduling = data.scheduling || {};
  const total = Number(data.total || payment.montoPagado || 0);

  return {
    marca: data.marca || "NOMAD",
    collection: NOMAD_COLLECTION,
    idFirestore: docSnap.id,
    folio: data.folio || docSnap.id,
    fechaEmision: normalizarFecha(data.fechaEmision || data.createdAt),
    paciente: data.paciente || "",
    medico: scheduling.medico || data.medico || "",
    kam: data.kam || "",
    aseguradora: data.aseguradora || "",
    telefono: data.telefono || "",
    sede: scheduling.sede || data.sede || "",
    total,
    status1: data.status1 || "Sin seguimiento",
    pagoStatus: payment.status || "Pendiente de pago",
    pagoFecha: normalizarFecha(payment.fechaPago),
    pagoMonto: Number(payment.montoPagado || total || 0),
    pagoMetodo: payment.metodo || "",
    pagoRegistradoPor: payment.registradoPor || "",
    pagoNotas: payment.notas || data.motivo || "",
    programacionStatus: scheduling.status || "Sin programación",
    programacionFecha: normalizarFecha(scheduling.fechaInfusion || data.fechaProgramacion),
    programacionHora: normalizarHora(scheduling.horaCita),
    servicio: normalizeMixedValue(scheduling.servicio || data.tipoServicio || ""),
    ciclo: normalizeMixedValue(scheduling.ciclo || data.ciclo || ""),
    tipoTratamiento: normalizeMixedValue(scheduling.tipoTratamiento || data.tipoTratamiento || ""),
    tratamiento: normalizeMixedValue(scheduling.tratamiento || data.tratamiento || data.pruebas || ""),
    diagnostico: normalizeMixedValue(scheduling.diagnostico || data.diagnostico || ""),
    programadoPor: scheduling.programadoPor || "",
    programacionNotas: scheduling.notas || "",
    direccion: data.direccion || "",
    sourceProject: "cotizador-nomad",
    sourceCollection: NOMAD_COLLECTION,
    sourceDocId: docSnap.id,
    origenData: data
  };
}


function sanitizeOperationalKey(value) {
  return String(value || "").replace(/[\/#?\[\]]/g, "_").trim();
}

function legacyOperationalDocId(row) {
  const raw = String(row?.folio || `${row?.marca || "ROW"}-${row?.idFirestore || "SINID"}`);
  return sanitizeOperationalKey(raw);
}

function operationalDocId(row) {
  const sourceKey = [
    row?.marca || "ROW",
    row?.sourceProject || "NOPROJECT",
    row?.sourceCollection || "NOCOLLECTION",
    row?.sourceDocId || row?.idFirestore || "SINID"
  ].join("__");
  return sanitizeOperationalKey(sourceKey);
}

function mergeOperationalData(row) {
  const exactKey = operationalDocId(row);
  const legacyKey = legacyOperationalDocId(row);
  const exactOp = embudoMap.get(exactKey);
  const legacyOp = exactOp ? null : embudoMap.get(legacyKey);
  const op = exactOp || legacyOp;
  if (!op) return row;
  const payment = op.payment || {};
  const scheduling = op.scheduling || {};
  const seguimiento = op.seguimiento || {};
  const merged = {
    ...row,
    sede: op.sede || row.sede || "",
    status1: seguimiento.status1 || row.status1 || "Sin seguimiento",
    pagoStatus: payment.status || row.pagoStatus || "Pendiente de pago",
    pagoFecha: normalizarFecha(payment.fechaPago || row.pagoFecha),
    pagoMonto: Number(payment.montoPagado ?? row.pagoMonto ?? row.total ?? 0),
    pagoMetodo: payment.metodo || row.pagoMetodo || "",
    pagoRegistradoPor: payment.registradoPor || row.pagoRegistradoPor || "",
    pagoNotas: payment.notas || row.pagoNotas || "",
    programacionStatus: scheduling.status || row.programacionStatus || "Sin programación",
    programacionFecha: normalizarFecha(scheduling.fechaInfusion || row.programacionFecha),
    programacionHora: normalizarHora(scheduling.horaCita || row.programacionHora),
    servicio: normalizeMixedValue(scheduling.servicio || row.servicio || "INFUSION"),
    ciclo: normalizeMixedValue(scheduling.ciclo || row.ciclo || ""),
    tipoTratamiento: normalizeMixedValue(scheduling.tipoTratamiento || row.tipoTratamiento || ""),
    tratamiento: normalizeMixedValue(scheduling.tratamiento || row.tratamiento || ""),
    diagnostico: normalizeMixedValue(scheduling.diagnostico || row.diagnostico || ""),
    medico: op.medico || row.medico || "",
    programadoPor: scheduling.programadoPor || row.programadoPor || "",
    programacionNotas: scheduling.notas || row.programacionNotas || ""
  };

  // IMPORTANTE:
  // Si el registro viene del documento legado por folio compartido,
  // NO debemos pisar los identificadores source* de la fila original,
  // porque eso haría que varias cotizaciones diferentes apunten al mismo
  // documento individual y vuelvan a cruzarse.
  if (exactOp) {
    merged.sourceProject = op.sourceProject || row.sourceProject;
    merged.sourceCollection = op.sourceCollection || row.sourceCollection;
    merged.sourceDocId = op.sourceDocId || row.sourceDocId;
  } else {
    merged.sourceProject = row.sourceProject;
    merged.sourceCollection = row.sourceCollection;
    merged.sourceDocId = row.sourceDocId;
  }

  return merged;
}

async function saveOperationalData(row, overrides = {}) {
  const payment = {
    status: overrides.payment?.status ?? row.pagoStatus ?? "Pendiente de pago",
    fechaPago: overrides.payment?.fechaPago ?? row.pagoFecha ?? "",
    montoPagado: Number(overrides.payment?.montoPagado ?? row.pagoMonto ?? row.total ?? 0),
    metodo: overrides.payment?.metodo ?? row.pagoMetodo ?? "",
    registradoPor: overrides.payment?.registradoPor ?? row.pagoRegistradoPor ?? "",
    notas: overrides.payment?.notas ?? row.pagoNotas ?? ""
  };
  const scheduling = {
    status: overrides.scheduling?.status ?? row.programacionStatus ?? "Sin programación",
    fechaInfusion: overrides.scheduling?.fechaInfusion ?? row.programacionFecha ?? "",
    horaCita: overrides.scheduling?.horaCita ?? row.programacionHora ?? "",
    servicio: overrides.scheduling?.servicio ?? row.servicio ?? "INFUSION",
    ciclo: overrides.scheduling?.ciclo ?? row.ciclo ?? "",
    tipoTratamiento: overrides.scheduling?.tipoTratamiento ?? row.tipoTratamiento ?? "",
    tratamiento: overrides.scheduling?.tratamiento ?? row.tratamiento ?? "",
    diagnostico: overrides.scheduling?.diagnostico ?? row.diagnostico ?? "",
    programadoPor: overrides.scheduling?.programadoPor ?? row.programadoPor ?? "",
    notas: overrides.scheduling?.notas ?? row.programacionNotas ?? ""
  };
  const seguimiento = {
    status1: overrides.seguimiento?.status1 ?? row.status1 ?? "",
    status2: overrides.seguimiento?.status2 ?? convertSchedulingToLegacyStatus(scheduling.status)
  };
  const opId = operationalDocId(row);
  const payload = {
    folio: row.folio || row.idFirestore || opId,
    marca: row.marca || "",
    paciente: row.paciente || "",
    medico: row.medico || "",
    sede: row.sede || "",
    sourceProject: row.sourceProject || "",
    sourceCollection: row.sourceCollection || "cotizaciones",
    sourceDocId: row.sourceDocId || row.idFirestore || "",
    payment,
    scheduling,
    seguimiento,
    updatedAt: serverTimestamp()
  };
  const existing = embudoMap.get(opId) || embudoMap.get(legacyOperationalDocId(row));
  if (!existing || !existing.createdAt) payload.createdAt = serverTimestamp();
  console.log("Guardando en embudo-innvida", opId, payload);
  await setDoc(doc(dbEmbudo, EMBUDO_COLLECTION, opId), payload, { merge: true });
  setSaveStatus(`Último guardado: ${payload.folio} · ${new Date().toLocaleString("es-MX")}`, "success");
  showToast("Cambios guardados en Firebase", "success");
}


function initRealtimeListeners() {
  onSnapshot(collection(dbSanare, SANARE_COLLECTION), snap => {
    sanareRows = snap.docs.map(mapSanareDoc);
    recomputeAll();
  }, err => console.error("Sanaré listener error", err));

  onSnapshot(collection(dbNomad, NOMAD_COLLECTION), snap => {
    nomadRows = snap.docs.map(mapNomadDoc);
    recomputeAll();
  }, err => console.error("Nomad listener error", err));

  onSnapshot(collection(dbEmbudo, EMBUDO_COLLECTION), snap => {
    embudoMap = new Map(snap.docs.map(d => [d.id, d.data()]));
    setSaveStatus(`Embudo conectado · ${snap.size} registros operativos`, "info");
    recomputeAll();
  }, err => { console.error("Embudo listener error", err); setSaveStatus("No se pudo leer embudo-innvida", "error"); showToast("Error leyendo embudo-innvida", "error"); });
}

function recomputeAll() {
  allRows = [...sanareRows, ...nomadRows].map(mergeOperationalData).sort((a, b) => (b.fechaEmision || "").localeCompare(a.fechaEmision || ""));
  $("ultimaActualizacion").textContent = `Actualizado: ${new Date().toLocaleString("es-MX")}`;
  applyFilters();
}

function applyFilters() {
  let rows = [...allRows];
  const marcas = filtrosMarca.filter(cb => cb.checked).map(cb => cb.value);
  if (marcas.length) rows = rows.filter(r => marcas.includes(r.marca));
  if (filtroFechaInicio.value) rows = rows.filter(r => r.fechaEmision >= filtroFechaInicio.value);
  if (filtroFechaFin.value) rows = rows.filter(r => r.fechaEmision <= filtroFechaFin.value);

  const text = filtroTexto.value.trim().toLowerCase();
  if (text) {
    rows = rows.filter(r => [r.folio, r.paciente, r.medico, r.kam, r.tratamiento, r.diagnostico].join(" ").toLowerCase().includes(text));
  }

  const st1 = selectedValues(filtroStatus1);
  const pago = selectedValues(filtroPago);
  const prog = selectedValues(filtroProgramacion);
  if (st1.length) rows = rows.filter(r => st1.includes(r.status1));
  if (pago.length) rows = rows.filter(r => pago.includes(r.pagoStatus));
  if (prog.length) rows = rows.filter(r => prog.includes(r.programacionStatus));
  if (filtroSede.value) rows = rows.filter(r => (r.sede || "") === filtroSede.value);

  filteredRows = rows;
  renderKPIs(rows);
  renderTable(rows);
  renderCharts(rows);
}

function renderKPIs(rows) {
  const activos = rows.filter(r => !["Perdida / rechazada", "Cancelada"].includes(r.status1));
  const pagados = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus));
  const porProgramar = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus) && ["Sin programación", "Por programar"].includes(r.programacionStatus));
  const programados = rows.filter(r => ["Programada", "Reprogramada", "Aplicada"].includes(r.programacionStatus));

  $("kpiCotizaciones").textContent = activos.length;
  $("kpiCotizacionesMonto").textContent = formatearMoneda(activos.reduce((a, r) => a + (r.total || 0), 0));
  $("kpiPagados").textContent = pagados.length;
  $("kpiPagadosMonto").textContent = formatearMoneda(pagados.reduce((a, r) => a + (r.pagoMonto || r.total || 0), 0));
  $("kpiPorProgramar").textContent = porProgramar.length;
  $("kpiPorProgramarMonto").textContent = formatearMoneda(porProgramar.reduce((a, r) => a + (r.pagoMonto || r.total || 0), 0));
  $("kpiProgramados").textContent = programados.length;
  $("kpiProgramadosMonto").textContent = formatearMoneda(programados.reduce((a, r) => a + (r.pagoMonto || r.total || 0), 0));
  $("contadorFilas").textContent = `${rows.length} registros`;
}

function paymentBadge(status) {
  if (["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(status)) return `<span class="pill status-paid">${status}</span>`;
  if (status === "Pago rechazado / no reflejado") return `<span class="pill" style="background:rgba(255,122,122,.12);color:#ffc1c1;">${status}</span>`;
  return `<span class="pill status-pending">${status}</span>`;
}

function schedulingBadge(status) {
  if (["Programada", "Reprogramada", "Aplicada"].includes(status)) return `<span class="pill status-programmed">${status}</span>`;
  if (status === "No aplicada / vencida") return `<span class="pill" style="background:rgba(255,122,122,.12);color:#ffc1c1;">${status}</span>`;
  return `<span class="pill status-pending">${status}</span>`;
}

function renderTable(rows) {
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.marca}</td>
      <td>${escapeHtml(row.folio)}</td>
      <td>${escapeHtml(row.paciente)}</td>
      <td>${escapeHtml(row.medico)}</td>
      <td>${escapeHtml(row.kam)}</td>
      <td>${escapeHtml(row.fechaEmision)}</td>
      <td class="money">${formatearMoneda(row.total)}</td>
      <td>${escapeHtml(row.status1)}</td>
      <td>${paymentBadge(row.pagoStatus)}</td>
      <td>${schedulingBadge(row.programacionStatus)}</td>
      <td>${escapeHtml(row.programacionFecha || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="action-link" data-open="${row.idFirestore}">Abrir</button>
          <button class="action-link" data-quickpay="${row.idFirestore}">${["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(row.pagoStatus) ? "Quitar pago" : "Pago"}</button>
          <button class="action-link" data-quickprogram="${row.idFirestore}">${["Programada", "Reprogramada", "Aplicada"].includes(row.programacionStatus) ? "Quitar programación" : "Programar"}</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => openDrawer(btn.dataset.open)));
  tbody.querySelectorAll("[data-quickpay]").forEach(btn => btn.addEventListener("click", () => quickMarkPaid(btn.dataset.quickpay)));
  tbody.querySelectorAll("[data-quickprogram]").forEach(btn => btn.addEventListener("click", () => quickMarkProgram(btn.dataset.quickprogram)));
}

async function quickMarkPaid(id) {
  const row = filteredRows.find(r => r.idFirestore === id) || allRows.find(r => r.idFirestore === id);
  if (!row) return;
  const yaPagado = ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(row.pagoStatus);
  try {
    await saveOperationalData(row, {
      payment: yaPagado ? {
        status: "Pendiente de pago",
        fechaPago: "",
        montoPagado: 0,
        metodo: "",
        registradoPor: "",
        notas: row.pagoNotas || ""
      } : {
        status: "Pago confirmado",
        fechaPago: new Date().toISOString().slice(0, 10),
        montoPagado: Number(row.total || 0),
        metodo: row.pagoMetodo || "",
        registradoPor: row.pagoRegistradoPor || "",
        notas: row.pagoNotas || ""
      },
      seguimiento: {
        status1: !yaPagado && row.status1 === "Sin seguimiento" ? "Cerrada / aceptada" : row.status1,
        status2: convertSchedulingToLegacyStatus(row.programacionStatus)
      }
    });
  } catch (error) {
    console.error(error);
    alert(yaPagado ? "No se pudo quitar el pago en embudo-innvida." : "No se pudo marcar el pago en embudo-innvida.");
  }
}

async function quickMarkProgram(id) {
  const row = filteredRows.find(r => r.idFirestore === id) || allRows.find(r => r.idFirestore === id);
  if (!row) return;
  const yaProgramado = ["Programada", "Reprogramada", "Aplicada"].includes(row.programacionStatus);
  if (yaProgramado) {
    try {
      await saveOperationalData(row, {
        scheduling: {
          status: "Sin programación",
          fechaInfusion: "",
          horaCita: "",
          servicio: row.servicio || "INFUSION",
          ciclo: row.ciclo || "",
          tipoTratamiento: row.tipoTratamiento || "",
          tratamiento: row.tratamiento || "",
          diagnostico: row.diagnostico || "",
          medico: row.medico || "",
          sede: row.sede || "",
          programadoPor: "",
          notas: row.programacionNotas || ""
        },
        seguimiento: {
          status1: row.status1 || "",
          status2: "Sin aplicación"
        }
      });
      return;
    } catch (error) {
      console.error(error);
      setSaveStatus("Error al actualizar programación", "error");
      showToast("No se pudo quitar la programación", "error");
      alert("No se pudo quitar la programación en embudo-innvida.");
      return;
    }
  }
  openDrawer(id);
  $("detalleProgramacionStatus").value = "Programada";
  if (!$("detalleProgramacionFecha").value) {
    $("detalleProgramacionFecha").value = new Date().toISOString().slice(0, 10);
  }
}

function renderCharts(rows) {
  const cotizadas = rows.filter(r => !["Perdida / rechazada", "Cancelada"].includes(r.status1)).length;
  const pagadas = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus)).length;
  const porProgramar = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus) && ["Sin programación", "Por programar"].includes(r.programacionStatus)).length;
  const programadas = rows.filter(r => ["Programada", "Reprogramada", "Aplicada"].includes(r.programacionStatus)).length;

  const embudoData = {
    labels: ["Cotizadas", "Pagadas", "Por programar", "Programadas"],
    datasets: [{
      label: "Registros",
      data: [cotizadas, pagadas, porProgramar, programadas]
    }]
  };

  const sanareMonto = rows.filter(r => r.marca === "SANARE").reduce((a, r) => a + (r.pagoMonto || r.total || 0), 0);
  const nomadMonto = rows.filter(r => r.marca !== "SANARE").reduce((a, r) => a + (r.pagoMonto || r.total || 0), 0);
  const marcaData = {
    labels: ["Sanaré", "Nomad"],
    datasets: [{
      label: "Monto",
      data: [sanareMonto, nomadMonto]
    }]
  };

  if (chartEmbudo) chartEmbudo.destroy();
  if (chartMarca) chartMarca.destroy();

  chartEmbudo = new Chart($("chartEmbudo"), {
    type: "bar",
    data: embudoData,
    options: baseChartOptions(false, cotizadas)
  });

  chartMarca = new Chart($("chartMarca"), {
    type: "doughnut",
    data: marcaData,
    options: baseChartOptions(true, sanareMonto + nomadMonto)
  });
}

function baseChartOptions(isCurrency, total = 0) {
  const isLight = document.body.classList.contains("theme-light");
  const legendColor = isLight ? "#17376c" : "#dce8fb";
  const tickColor = isLight ? "#36557f" : "#c9d8ef";
  const gridColor = isLight ? "rgba(71,85,105,.12)" : "rgba(148,163,184,.1)";
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: legendColor } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number(ctx.parsed || 0);
            const base = isCurrency ? formatearMoneda(value) : formatNumber(value);
            return `${ctx.label}: ${base} · ${porcentaje(value, total)}`;
          }
        }
      }
    },
    scales: isCurrency ? undefined : {
      x: { ticks: { color: tickColor }, grid: { color: gridColor } },
      y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } }
    }
  };
}

function openDrawer(id) {
  selectedRow = allRows.find(r => r.idFirestore === id);
  if (!selectedRow) return;
  $("drawerMarca").textContent = selectedRow.marca;
  $("drawerPaciente").textContent = selectedRow.paciente || "Sin nombre";
  $("drawerMeta").textContent = `${selectedRow.folio || "Sin folio"} · ${selectedRow.medico || "Sin médico"}`;

  $("drawerResumen").innerHTML = [
    ["Total cotizado", formatearMoneda(selectedRow.total)],
    ["Fecha emisión", selectedRow.fechaEmision || "—"],
    ["KAM", selectedRow.kam || "—"],
    ["Aseguradora", selectedRow.aseguradora || "—"],
    ["Tratamiento", selectedRow.tratamiento || "—"],
    ["Diagnóstico", selectedRow.diagnostico || "—"],
    ["Seguimiento", selectedRow.status1 || "—"],
    ["Sede", selectedRow.sede || "—"]
  ].map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

  $("detallePagoStatus").innerHTML = PAGO_OPCIONES.map(v => `<option value="${v}">${v}</option>`).join("");
  $("detalleProgramacionStatus").innerHTML = PROGRAMACION_OPCIONES.map(v => `<option value="${v}">${v}</option>`).join("");

  $("detallePagoStatus").value = selectedRow.pagoStatus || "Pendiente de pago";
  $("detallePagoFecha").value = selectedRow.pagoFecha || "";
  $("detallePagoMonto").value = selectedRow.pagoMonto || selectedRow.total || 0;
  $("detallePagoMetodo").value = selectedRow.pagoMetodo || "";
  $("detallePagoRegistradoPor").value = selectedRow.pagoRegistradoPor || "";
  $("detallePagoNotas").value = selectedRow.pagoNotas || "";

  $("detalleProgramacionStatus").value = selectedRow.programacionStatus || "Sin programación";
  $("detalleProgramacionFecha").value = selectedRow.programacionFecha || "";
  $("detalleProgramacionHora").value = selectedRow.programacionHora || "";
  $("detalleServicio").value = selectedRow.servicio || "";
  $("detalleCiclo").value = selectedRow.ciclo || "";
  $("detalleTipoTratamiento").value = selectedRow.tipoTratamiento || "";
  $("detalleTratamiento").value = selectedRow.tratamiento || "";
  $("detalleDiagnostico").value = selectedRow.diagnostico || "";
  $("detalleMedico").value = selectedRow.medico || "";
  $("detalleSede").value = selectedRow.sede || "";
  $("detalleProgramadoPor").value = selectedRow.programadoPor || "";
  $("detalleProgramacionNotas").value = selectedRow.programacionNotas || "";

  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
}

function closeDrawer() {
  drawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
  selectedRow = null;
}

async function saveDrawer() {
  if (!selectedRow) return;
  const paymentStatus = $("detallePagoStatus").value;
  const schedulingStatus = $("detalleProgramacionStatus").value;

  const payload = {
    payment: {
      status: paymentStatus,
      fechaPago: $("detallePagoFecha").value || "",
      montoPagado: Number($("detallePagoMonto").value || 0),
      metodo: $("detallePagoMetodo").value.trim(),
      registradoPor: $("detallePagoRegistradoPor").value.trim(),
      notas: $("detallePagoNotas").value.trim()
    },
    scheduling: {
      status: schedulingStatus,
      fechaInfusion: $("detalleProgramacionFecha").value || "",
      horaCita: $("detalleProgramacionHora").value || "",
      servicio: $("detalleServicio").value.trim(),
      ciclo: $("detalleCiclo").value.trim(),
      tipoTratamiento: $("detalleTipoTratamiento").value.trim(),
      tratamiento: $("detalleTratamiento").value.trim(),
      diagnostico: $("detalleDiagnostico").value.trim(),
      medico: $("detalleMedico").value.trim(),
      sede: $("detalleSede").value.trim(),
      programadoPor: $("detalleProgramadoPor").value.trim(),
      notas: $("detalleProgramacionNotas").value.trim()
    },
    status1: paymentStatus === "Pago confirmado" && selectedRow.status1 === "Sin seguimiento"
      ? "Cerrada / aceptada"
      : selectedRow.status1,
    status2: convertSchedulingToLegacyStatus(schedulingStatus),
    motivo: $("detallePagoNotas").value.trim() || $("detalleProgramacionNotas").value.trim() || selectedRow.pagoNotas || ""
  };

  try {
    await saveOperationalData(selectedRow, {
      payment: payload.payment,
      scheduling: payload.scheduling,
      seguimiento: {
        status1: payload.status1,
        status2: payload.status2
      }
    });
    closeDrawer();
  } catch (error) {
    console.error(error);
    setSaveStatus("Error al guardar en Firebase", "error");
    showToast("No se pudieron guardar los cambios en Firebase", "error");
    alert("No se pudieron guardar los cambios en Firebase. Revisa consola y reglas del proyecto embudo-innvida.");
  }
}

function convertSchedulingToLegacyStatus(value) {
  if (["Programada", "Reprogramada", "Aplicada", "No aplicada / vencida"].includes(value)) return value;
  if (value === "Por programar") return "Por programar";
  return "Sin aplicación";
}



async function exportFacturacion() {
  if (!window.ExcelJS) { alert('No se cargó la librería de Excel. Abre esta versión con internet y vuelve a intentar.'); return; }

  try {
  const rows = filteredRows.map(r => ([
    excelDateValue(r.pagoFecha),
    r.marca,
    r.folio,
    r.paciente,
    r.medico,
    r.pagoStatus,
    Number(r.pagoMonto || r.total || 0),
    r.pagoMetodo,
    r.pagoRegistradoPor,
    r.tratamiento,
    r.diagnostico,
    r.sede,
    r.pagoNotas
  ]));

  await downloadWorkbookFromTemplate({
    templatePath: 'templates/facturacion_template.xlsx',
    fileName: `facturacion_operativa_${new Date().toISOString().slice(0, 10)}.xlsx`,
    startRow: 5,
    rows,
    moneyColumns: [7],
    dateColumns: [1],
    centeredColumns: [1, 2, 6, 8, 12]
  });
  showToast('Excel de facturación descargado', 'success');
  } catch (error) {
    console.error('Error exportando facturación', error);
    setSaveStatus('Error al exportar facturación', 'error');
    showToast('No se pudo descargar Excel facturación', 'error');
    alert('No se pudo descargar el Excel de facturación. Revisa la consola.');
  }
}

async function exportProgramacion() {
  if (!window.ExcelJS) { alert('No se cargó la librería de Excel. Abre esta versión con internet y vuelve a intentar.'); return; }

  try {
    if (!filteredRows.length) {
      alert('No hay registros para exportar.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PROGRAMACIÓN 2026', {
      views: [{ state: 'frozen', ySplit: 3 }]
    });

    worksheet.columns = [
      { header: 'Fecha Infusión', key: 'fechaInfusion', width: 16 },
      { header: 'Semana', key: 'semana', width: 11 },
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Servicio', key: 'servicio', width: 18 },
      { header: 'Hora de Cita', key: 'horaCita', width: 14 },
      { header: 'Ciclo', key: 'ciclo', width: 11 },
      { header: 'Paciente', key: 'paciente', width: 34 },
      { header: 'Médicos', key: 'medico', width: 26 },
      { header: 'Tipo de tratamiento', key: 'tipoTratamiento', width: 20 },
      { header: '1º vez', key: 'primeraVez', width: 14 },
      { header: 'Tratamiento', key: 'tratamiento', width: 34 },
      { header: 'Diagnostico', key: 'diagnostico', width: 34 },
      { header: 'Estatus', key: 'estatus', width: 18 },
      { header: 'Programado por', key: 'programadoPor', width: 20 },
      { header: 'Sede', key: 'sede', width: 16 },
      { header: 'Marca', key: 'marca', width: 14 },
      { header: 'Folio', key: 'folio', width: 22 },
      { header: 'Notas', key: 'notas', width: 34 }
    ];

    worksheet.mergeCells('A1:R2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Programación Tratamiento SAI';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF2E2A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const headerRow = worksheet.getRow(3);
    headerRow.values = worksheet.columns.map(col => col.header);
    headerRow.height = 34;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A70' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF2A4F86' } },
        left: { style: 'thin', color: { argb: 'FF2A4F86' } },
        bottom: { style: 'thin', color: { argb: 'FF2A4F86' } },
        right: { style: 'thin', color: { argb: 'FF2A4F86' } }
      };
    });

    filteredRows.forEach((r, idx) => {
      const row = worksheet.addRow({
        fechaInfusion: excelDateValue(r.programacionFecha) || '',
        semana: weekNumber(r.programacionFecha),
        mes: monthName(r.programacionFecha),
        servicio: normalizeMixedValue(r.servicio),
        horaCita: r.programacionHora ? `${r.programacionHora} hrs` : '',
        ciclo: normalizeMixedValue(r.ciclo),
        paciente: r.paciente || '',
        medico: r.medico || '',
        tipoTratamiento: normalizeMixedValue(r.tipoTratamiento),
        primeraVez: primeraVezLabel(r),
        tratamiento: normalizeMixedValue(r.tratamiento),
        diagnostico: normalizeMixedValue(r.diagnostico),
        estatus: r.programacionStatus || 'Sin programación',
        programadoPor: r.programadoPor || '',
        sede: r.sede || '',
        marca: r.marca || '',
        folio: r.folio || '',
        notas: r.programacionNotas || ''
      });

      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1F1F1F' } },
          left: { style: 'thin', color: { argb: 'FF1F1F1F' } },
          bottom: { style: 'thin', color: { argb: 'FF1F1F1F' } },
          right: { style: 'thin', color: { argb: 'FF1F1F1F' } }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF111111' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF7F7F7' : 'FFFFFFFF' } };
      });

      row.getCell(1).numFmt = 'dd/mm/yyyy';
      [1,2,3,4,5,6,9,10,13,15,16].forEach(col => {
        row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
    });

    worksheet.autoFilter = {
      from: 'A3',
      to: `R${Math.max(3, worksheet.rowCount)}`
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `programacion_operativa_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1200);

    setSaveStatus('Excel de programación descargado', 'success');
    showToast('Excel de programación descargado', 'success');
  } catch (error) {
    console.error('Error exportando programación', error);
    setSaveStatus('Error al exportar programación', 'error');
    showToast('No se pudo descargar Excel programación', 'error');
    alert('No se pudo descargar el Excel de programación. Revisa la consola.');
  }
}

function excelDateValue(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date;
}

function primeraVezLabel(row) {
  const ciclo = String(row.ciclo || '').trim().toUpperCase();
  if (!ciclo) return '';
  return ['C1', '1', 'CICLO 1'].includes(ciclo) ? '1A VEZ' : 'SUBSECUENTE';
}

async function downloadWorkbookFromTemplate({ templatePath, fileName, startRow, rows, moneyColumns = [], dateColumns = [], centeredColumns = [] }) {
  if (!rows.length) {
    alert('No hay registros para exportar.');
    return;
  }

  const response = await fetch(templatePath);
  if (!response.ok) throw new Error(`No se pudo cargar plantilla: ${templatePath}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];

  const templateStyles = [];
  const sourceRow = worksheet.getRow(startRow);
  for (let col = 1; col <= sourceRow.cellCount; col += 1) {
    const cell = sourceRow.getCell(col);
    templateStyles.push({
      style: JSON.parse(JSON.stringify(cell.style || {})),
      numFmt: cell.numFmt,
      font: JSON.parse(JSON.stringify(cell.font || {})),
      fill: JSON.parse(JSON.stringify(cell.fill || {})),
      border: JSON.parse(JSON.stringify(cell.border || {})),
      alignment: JSON.parse(JSON.stringify(cell.alignment || {}))
    });
  }
  const sourceHeight = sourceRow.height || 18;

  if (worksheet.rowCount >= startRow) {
    worksheet.spliceRows(startRow, worksheet.rowCount - startRow + 1);
  }

  rows.forEach((dataRow, index) => {
    const rowNumber = startRow + index;
    const row = worksheet.getRow(rowNumber);
    row.values = dataRow;
    row.height = sourceHeight;

    dataRow.forEach((value, idx) => {
      const col = idx + 1;
      const cell = row.getCell(col);
      const style = templateStyles[idx] || {};
      if (style.style && Object.keys(style.style).length) cell.style = style.style;
      if (style.font && Object.keys(style.font).length) cell.font = style.font;
      if (style.fill && Object.keys(style.fill).length) cell.fill = style.fill;
      if (style.border && Object.keys(style.border).length) cell.border = style.border;
      if (style.alignment && Object.keys(style.alignment).length) cell.alignment = style.alignment;
      if (moneyColumns.includes(col)) cell.numFmt = '$#,##0.00';
      if (dateColumns.includes(col)) cell.numFmt = 'dd/mm/yyyy';
      if (centeredColumns.includes(col)) {
        cell.alignment = { ...(cell.alignment || {}), horizontal: 'center', vertical: 'center', wrapText: true };
      }
      if (moneyColumns.includes(col)) {
        cell.alignment = { ...(cell.alignment || {}), horizontal: 'right', vertical: 'center', wrapText: true };
      }
      if (!centeredColumns.includes(col) && !moneyColumns.includes(col)) {
        cell.alignment = { ...(cell.alignment || {}), horizontal: 'left', vertical: 'center', wrapText: true };
      }
      if (typeof value === 'string' && value.trim() === '') cell.value = '';
    });
  });

  applyConditionalFormatting(worksheet, startRow, rows[0].length);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1200);
}

function applyConditionalFormatting(worksheet, startRow, totalColumns) {
  for (let rowNumber = startRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    for (let col = 1; col <= totalColumns; col += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(col);
      const value = String(cell.value || '');
      if (['Pago confirmado', 'Anticipo recibido', 'Pago parcial', 'Programada', 'Reprogramada', 'Aplicada'].includes(value)) {
        cell.font = { ...(cell.font || {}), bold: true, color: { argb: '1E7A46' } };
      } else if (['Pago rechazado / no reflejado', 'No aplicada / vencida'].includes(value)) {
        cell.font = { ...(cell.font || {}), bold: true, color: { argb: 'C0392B' } };
      }
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildExecutiveReport(rows) {
  const total = rows.length;
  const cotizadas = rows.filter(r => !["Perdida / rechazada", "Cancelada"].includes(r.status1)).length;
  const pagadas = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus)).length;
  const programadas = rows.filter(r => ["Programada", "Reprogramada", "Aplicada"].includes(r.programacionStatus)).length;
  const porProgramar = rows.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus) && ["Sin programación", "Por programar"].includes(r.programacionStatus)).length;
  const totalMonto = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  const totalPagado = rows.reduce((a, r) => a + Number(r.pagoMonto || r.total || 0), 0);
  const grouped = (key) => {
    const map = new Map();
    rows.forEach(r => {
      const k = String(r[key] || 'Sin asignar').trim() || 'Sin asignar';
      const cur = map.get(k) || { count: 0, nuevos: 0, monto: 0 };
      cur.count += 1;
      cur.monto += Number(r.total || 0);
      const repeats = allRows.filter(x => `${x.marca}|${x.paciente}` === `${r.marca}|${r.paciente}`).length;
      if (repeats === 1) cur.nuevos += 1;
      map.set(k, cur);
    });
    return [...map.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,5);
  };
  const recurrentes = [...new Map(rows.map(r => [`${r.marca}|${r.paciente}`, r])).values()].filter(r => allRows.filter(x => `${x.marca}|${x.paciente}` === `${r.marca}|${r.paciente}`).length > 1).slice(0,10);
  const medicos = grouped('medico');
  const kams = grouped('kam');
  const recomendaciones = [
    porProgramar ? `Hay ${porProgramar} pacientes pagados que aún no tienen fecha de programación; conviene priorizarlos hoy.` : 'No hay pacientes pagados pendientes de programación en el corte actual.',
    medicos[0] ? `El médico con mayor carga del corte es ${medicos[0][0]} con ${medicos[0][1].count} pacientes.` : 'No hay médico líder identificable en el corte.',
    kams[0] ? `El KAM con más pacientes nuevos es ${kams[0][0]} con ${kams[0][1].nuevos} nuevos ingresos.` : 'No hay KAM líder identificable en el corte.'
  ];
  const periodLabel = `${filtroFechaInicio.value || 'inicio'} a ${filtroFechaFin.value || 'hoy'}`;
  const chartBars = [
    ['Cotizadas', cotizadas, '#3b82f6'],
    ['Pagadas', pagadas, '#10b981'],
    ['Por programar', porProgramar, '#f59e0b'],
    ['Programadas', programadas, '#8b5cf6']
  ];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte ejecutivo INNVIDA</title><style>
  body{font-family:Arial,sans-serif;margin:28px;color:#172b4d} h1{margin:0 0 8px} .muted{color:#5b6b84} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0} .card{border:1px solid #d9e2f1;border-radius:16px;padding:16px;background:#f8fbff} .big{font-size:28px;font-weight:700}.bars{margin:18px 0}.bar{margin:12px 0}.track{height:18px;border-radius:10px;background:#e8eef8;overflow:hidden}.fill{height:100%;border-radius:10px}.row{display:flex;justify-content:space-between;gap:12px;font-size:14px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:18px} table{width:100%;border-collapse:collapse;font-size:13px} th,td{border:1px solid #d9e2f1;padding:8px;text-align:left} th{background:#eef4ff} ul{padding-left:18px} @media print{body{margin:14px}}
  </style></head><body><div class="muted">INNVIDA · Reporte ejecutivo</div><h1>Embudo operativo</h1><div class="muted">Corte: ${periodLabel} · Generado: ${new Date().toLocaleString('es-MX')}</div>
  <div class="grid"><div class="card"><div class="muted">Cotizaciones</div><div class="big">${formatNumber(cotizadas)}</div><div>${formatearMoneda(totalMonto)}</div></div><div class="card"><div class="muted">Pagadas</div><div class="big">${formatNumber(pagadas)}</div><div>${porcentaje(pagadas,cotizadas)}</div></div><div class="card"><div class="muted">Por programar</div><div class="big">${formatNumber(porProgramar)}</div><div>${porcentaje(porProgramar,cotizadas)}</div></div><div class="card"><div class="muted">Programadas</div><div class="big">${formatNumber(programadas)}</div><div>${formatearMoneda(totalPagado)}</div></div></div>
  <h2>Conversión operativa</h2><div class="bars">${chartBars.map(([label,val,color])=>`<div class="bar"><div class="row"><strong>${label}</strong><span>${formatNumber(val)} · ${porcentaje(val,cotizadas)}</span></div><div class="track"><div class="fill" style="width:${cotizadas?Math.max(6,(val/cotizadas)*100):0}%;background:${color}"></div></div></div>`).join('')}</div>
  <div class="cols"><div><h2>Médicos con más pacientes nuevos</h2><table><thead><tr><th>Médico</th><th>Pacientes</th><th>Nuevos</th></tr></thead><tbody>${medicos.map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td>${formatNumber(v.count)}</td><td>${formatNumber(v.nuevos)}</td></tr>`).join('')}</tbody></table><h2>KAM con más pacientes nuevos</h2><table><thead><tr><th>KAM</th><th>Pacientes</th><th>Nuevos</th></tr></thead><tbody>${kams.map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td>${formatNumber(v.count)}</td><td>${formatNumber(v.nuevos)}</td></tr>`).join('')}</tbody></table></div><div><h2>Pacientes recurrentes</h2><table><thead><tr><th>Paciente</th><th>Médico</th><th>Marca</th><th>Folio</th></tr></thead><tbody>${recurrentes.map(r=>`<tr><td>${escapeHtml(r.paciente)}</td><td>${escapeHtml(r.medico)}</td><td>${escapeHtml(r.marca)}</td><td>${escapeHtml(r.folio)}</td></tr>`).join('')}</tbody></table><h2>Recomendaciones</h2><ul>${recomendaciones.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul></div></div></body></html>`;
}

function exportReporte() {
  const rows = filteredRows.length ? filteredRows : allRows;
  if (!rows.length) {
    alert('No hay registros para generar el reporte.');
    return;
  }
  const html = buildExecutiveReport(rows);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `reporte_ejecutivo_innvida_${new Date().toISOString().slice(0,10)}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1200);
  showToast('Reporte ejecutivo descargado', 'success');
}

function weekNumber(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString + "T00:00:00");
  const firstDay = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - firstDay) / 86400000) + firstDay.getDay() + 1) / 7);
}

function monthName(dateString) {
  if (!dateString) return "";
  return new Date(dateString + "T00:00:00").toLocaleDateString("es-MX", { month: "long" });
}


function setCurrentMonthView() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  filtroFechaInicio.value = start.toISOString().slice(0, 10);
  filtroFechaFin.value = end.toISOString().slice(0, 10);
}

function initEvents() {
  [filtroFechaInicio, filtroFechaFin, filtroTexto, filtroStatus1, filtroPago, filtroProgramacion, filtroSede].forEach(el => {
    el.addEventListener("change", applyFilters);
    if (el.tagName === "INPUT") el.addEventListener("input", applyFilters);
  });
  filtrosMarca.forEach(cb => cb.addEventListener("change", applyFilters));
  $("btnLimpiarFiltros").addEventListener("click", () => {
    filtroFechaInicio.value = "";
    filtroFechaFin.value = "";
    filtroTexto.value = "";
    filtroSede.value = "";
    [filtroStatus1, filtroPago, filtroProgramacion].forEach(sel => Array.from(sel.options).forEach(opt => opt.selected = false));
    filtrosMarca.forEach(cb => cb.checked = true);
    applyFilters();
  });

  $("btnCerrarDrawer").addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  $("btnGuardarDetalle").addEventListener("click", saveDrawer);
  $("btnExportFacturacion").addEventListener("click", exportFacturacion);
  $("btnExportProgramacion").addEventListener("click", exportProgramacion);
  $("btnExportReporte").addEventListener("click", exportReporte);
}

initFilters();
setCurrentMonthView();
initEvents();
initTheme();
setSaveStatus("Conectando con Firebase...", "info");
initRealtimeListeners();
