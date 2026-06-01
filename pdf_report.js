// pdf_report.js — Reporte Estratégico PDF (tema claro)
// Requiere: jsPDF (window.jspdf) + html2canvas

(function () {

  /* ─── Paleta CLARA ─── */
  const C = {
    bg:      [255, 255, 255],   // blanco
    surface: [245, 247, 252],   // gris muy claro
    border:  [220, 225, 235],   // gris borde
    blue:    [37, 99, 235],     // azul oscuro legible
    pink:    [219, 39, 119],    // rosa oscuro legible
    green:   [5, 150, 105],     // verde oscuro
    purple:  [109, 40, 217],    // violeta
    text:    [15, 23, 42],      // casi negro
    muted:   [100, 116, 139],   // gris medio
    accent:  [37, 99, 235],     // azul principal
    warning: [180, 83, 9],      // naranja oscuro
    white:   [255, 255, 255],
  };

  const fmt = (v) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

  /* ─── Helpers ─── */
  function setFont(doc, size, style = "normal", color = C.text) {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", style);
  }

  function fillRect(doc, x, y, w, h, color, radius = 3) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, radius, radius, "F");
  }

  function strokeRect(doc, x, y, w, h, color, lw = 0.4, radius = 3) {
    doc.setDrawColor(...color);
    doc.setLineWidth(lw);
    doc.roundedRect(x, y, w, h, radius, radius, "S");
  }

  function hLine(doc, y, color = C.border) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(14, y, 196, y);
  }

  function badge(doc, x, y, label, color) {
    setFont(doc, 7, "bold", color);
    const tw = doc.getTextWidth(label);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y - 4.5, tw + 8, 6.5, 1.5, 1.5, "S");
    doc.text(label, x + 4, y + 0.5);
  }

  /* ─── Captura canvas ─── */
  async function captureCanvas(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    try {
      const img = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, logging: false });
      return img.toDataURL("image/png");
    } catch { return null; }
  }

  /* ════════════════════════════════════════
     PORTADA
  ════════════════════════════════════════ */
  function drawCover(doc) {
    const W = 210;

    // Fondo blanco
    fillRect(doc, 0, 0, W, 297, C.bg, 0);

    // Franja superior azul
    fillRect(doc, 0, 0, W, 72, C.blue, 0);

    // Acento decorativo derecho
    doc.setFillColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.06 }));
    doc.circle(190, 20, 55, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    // Títulos sobre franja azul
    setFont(doc, 9, "bold", [200, 220, 255]);
    doc.text("REPORTE ESTRATÉGICO", 14, 20);

    setFont(doc, 26, "bold", C.white);
    doc.text("Comercial", 14, 40);
    setFont(doc, 26, "bold", [180, 210, 255]);
    doc.text("& Ventas", 14, 54);

    const now = new Date();
    const dateStr = now.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
    setFont(doc, 8, "normal", [190, 215, 255]);
    doc.text(dateStr, 14, 66);

    // Línea separadora
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(14, 78, 196, 78);

    // Chips de plataforma
    let bx = 14;
    badge(doc, bx, 90, "NOMAD DIGITAL", C.blue);  bx += 55;
    badge(doc, bx, 90, "SANARE CARE",   C.pink);  bx += 48;
    badge(doc, bx, 90, "EMBUDO INNVIDA", C.purple);

    // Descripción
    fillRect(doc, 14, 98, 182, 24, C.surface, 4);
    strokeRect(doc, 14, 98, 182, 24, C.border, 0.3, 4);
    setFont(doc, 8, "normal", C.muted);
    const desc = "Análisis ejecutivo de plataformas Nomad Digital y Sanare Care: métricas de ventas, " +
      "desempeño por KAM, tasas de conversión del embudo operativo e iniciativas estratégicas " +
      "accionables para el incremento de ingresos diarios.";
    const descLines = doc.splitTextToSize(desc, 172);
    doc.text(descLines, 18, 107);

    // Tarjetas métricas
    const nomadData  = window._nomadData  || [];
    const sanareData = window._sanareData || [];
    const embudoData = window._embudoData || [];

    const nomadSales  = nomadData.filter(q => q.accepted).reduce((s, q) => s + q.total, 0);
    const sanareSales = sanareData.filter(q => q.accepted).reduce((s, q) => s + Number(q.total || 0), 0);
    const embudoPagos = embudoData.filter(r => ["Pago confirmado","Pago parcial","Anticipo recibido"].includes(r.pagoStatus));
    const embudoMonto = embudoPagos.reduce((s, r) => s + r.pagoMonto, 0);

    const cards = [
      { label: "Ventas Nomad",    value: fmt(nomadSales),              color: C.blue   },
      { label: "Ventas Sanare",   value: fmt(sanareSales),             color: C.pink   },
      { label: "Cobrado Embudo",  value: fmt(embudoMonto),             color: C.green  },
      { label: "Total Combinado", value: fmt(nomadSales + sanareSales),color: C.purple },
    ];

    const cx = [14, 63, 112, 161];
    cards.forEach((c, i) => {
      fillRect(doc, cx[i], 130, 44, 30, C.surface, 4);
      strokeRect(doc, cx[i], 130, 44, 30, c.color, 0.6, 4);
      // Franjita color arriba
      fillRect(doc, cx[i], 130, 44, 4, c.color, 4);
      setFont(doc, 6.5, "normal", C.muted);
      doc.text(c.label, cx[i] + 3, 141);
      setFont(doc, 8.5, "bold", c.color);
      const vl = doc.splitTextToSize(c.value, 38);
      doc.text(vl, cx[i] + 3, 150);
    });

    // Footer portada
    fillRect(doc, 0, 282, 210, 15, C.surface, 0);
    setFont(doc, 7, "normal", C.muted);
    doc.text("Generado por Jane AI  •  Orbit AI Dashboard", 105, 291, { align: "center" });
  }

  /* ════════════════════════════════════════
     ENCABEZADO DE SECCIÓN
  ════════════════════════════════════════ */
  function sectionHeader(doc, title, subtitle, color, y) {
    fillRect(doc, 0, y, 210, subtitle ? 17 : 12, C.surface, 0);
    // Barra lateral de color
    fillRect(doc, 0, y, 4, subtitle ? 17 : 12, color, 0);
    hLine(doc, y + (subtitle ? 17 : 12), C.border);
    setFont(doc, 11, "bold", color);
    doc.text(title, 10, y + 8);
    if (subtitle) {
      setFont(doc, 7, "normal", C.muted);
      doc.text(subtitle, 10, y + 14);
    }
    return y + (subtitle ? 17 : 12) + 4;
  }

  /* ════════════════════════════════════════
     TABLA KAMs
  ════════════════════════════════════════ */
  function drawKamTable(doc, rows, y, color) {
    const headers = ["KAM", "Registros", "Ventas", "Comisión Est."];
    const colW    = [60, 28, 52, 40];
    const x0 = 14;

    // Header row
    fillRect(doc, x0, y, 182, 8, color, 3);
    let cx = x0 + 3;
    headers.forEach((h, i) => {
      setFont(doc, 7, "bold", C.white);
      doc.text(h, cx, y + 5.5);
      cx += colW[i];
    });
    y += 8;

    rows.forEach((row, ri) => {
      if (ri % 2 === 0) fillRect(doc, x0, y, 182, 8, C.surface, 2);
      strokeRect(doc, x0, y, 182, 8, C.border, 0.2, 0);
      cx = x0 + 3;
      const cells = [row[0], String(row[1]), fmt(row[2]), fmt(row[3])];
      cells.forEach((cell, ci) => {
        const cellColor = ci === 2 ? color : (ci === 0 ? C.text : C.muted);
        setFont(doc, 7, ci === 0 ? "bold" : "normal", cellColor);
        doc.text(doc.splitTextToSize(cell, colW[ci] - 4)[0], cx, y + 5.5);
        cx += colW[ci];
      });
      y += 8;
    });
    return y + 5;
  }

  /* ════════════════════════════════════════
     BLOQUE RECOMENDACIÓN
  ════════════════════════════════════════ */
  function drawRecommendations(doc, items, y, color) {
    items.forEach((item, i) => {
      if (y > 264) {
        doc.addPage();
        fillRect(doc, 0, 0, 210, 297, C.bg, 0);
        y = 16;
      }
      fillRect(doc, 14, y, 182, 20, C.surface, 4);
      strokeRect(doc, 14, y, 182, 20, C.border, 0.3, 4);
      // Borde izquierdo de color
      fillRect(doc, 14, y, 3, 20, color, 2);

      // Número en círculo
      doc.setFillColor(...color);
      doc.circle(23, y + 10, 4.5, "F");
      setFont(doc, 8, "bold", C.white);
      doc.text(String(i + 1), 23, y + 12.5, { align: "center" });

      // Título y cuerpo
      setFont(doc, 8, "bold", C.text);
      doc.text(item.title, 31, y + 8);
      setFont(doc, 7, "normal", C.muted);
      const bLines = doc.splitTextToSize(item.body, 157);
      doc.text(bLines[0], 31, y + 14.5);

      y += 24;
    });
    return y + 3;
  }

  /* ════════════════════════════════════════
     PÁGINA PLATAFORMA (Nomad / Sanare)
  ════════════════════════════════════════ */
  async function drawPlatformPage(doc, platform) {
    doc.addPage();
    fillRect(doc, 0, 0, 210, 297, C.bg, 0);

    const isNomad  = platform === "nomad";
    const color    = isNomad ? C.blue : C.pink;
    const label    = isNomad ? "NOMAD DIGITAL" : "SANARE CARE";
    const canvasId = isNomad ? "nomadChart" : "sanareChart";

    let y = sectionHeader(doc, `Panel ${label}`, "Métricas de ventas, KAMs y desempeño comercial", color, 0);

    // Gráfico
    const chartImg = await captureCanvas(canvasId);
    if (chartImg) {
      fillRect(doc, 14, y, 182, 56, C.surface, 4);
      strokeRect(doc, 14, y, 182, 56, C.border, 0.3, 4);
      doc.addImage(chartImg, "PNG", 16, y + 2, 178, 52);
      y += 60;
    }

    // KPIs
    const data     = isNomad ? (window._nomadData || []) : (window._sanareData || []);
    const accepted = data.filter(q => q.accepted);
    const sales    = accepted.reduce((s, q) => s + Number(q.total || 0), 0);
    const comm     = isNomad
      ? accepted.reduce((s, q) => s + (q.matchedCommercial || 0), 0)
      : sales * 0.1;
    const pipeline = data.filter(q => !q.accepted).length;
    const convRate = data.length ? Math.round((accepted.length / data.length) * 100) : 0;

    const stats = [
      { l: "Ventas Cerradas", v: fmt(sales),             c: color    },
      { l: "Comisiones",      v: fmt(comm),              c: C.green  },
      { l: "En Pipeline",     v: pipeline + " cot.",     c: C.warning},
      { l: "Conversión",      v: convRate + "%",         c: C.purple },
    ];
    const sx = [14, 62, 110, 158];
    stats.forEach((s, i) => {
      fillRect(doc, sx[i], y, 44, 24, C.surface, 4);
      strokeRect(doc, sx[i], y, 44, 24, s.c, 0.5, 4);
      fillRect(doc, sx[i], y, 44, 3, s.c, 4);
      setFont(doc, 6, "normal", C.muted);
      doc.text(s.l, sx[i] + 3, y + 11);
      setFont(doc, 9, "bold", s.c);
      doc.text(s.v, sx[i] + 3, y + 19);
    });
    y += 30;

    // Tabla KAMs
    const kamMap = {};
    accepted.forEach(q => {
      const k = q.kam || "Sin asignar";
      if (!kamMap[k]) kamMap[k] = { count: 0, sales: 0, comm: 0 };
      kamMap[k].count++;
      kamMap[k].sales += Number(q.total || 0);
      kamMap[k].comm  += isNomad ? (q.matchedCommercial || 0) : Number(q.total || 0) * 0.1;
    });
    const kamRows = Object.entries(kamMap)
      .sort((a, b) => b[1].sales - a[1].sales)
      .slice(0, 6)
      .map(([k, d]) => [k, d.count, d.sales, d.comm]);

    if (kamRows.length) {
      setFont(doc, 8.5, "bold", C.text);
      doc.text("Desempeño por KAM", 14, y + 7);
      y += 11;
      y = drawKamTable(doc, kamRows, y, color);
    }

    return y;
  }

  /* ════════════════════════════════════════
     RECOMENDACIONES DINÁMICAS
  ════════════════════════════════════════ */
  function buildRecommendations() {
    const nomad  = window._nomadData  || [];
    const sanare = window._sanareData || [];
    const embudo = window._embudoData || [];

    const nomadAcc  = nomad.filter(q => q.accepted);
    const sanareAcc = sanare.filter(q => q.accepted);
    const pagados   = embudo.filter(r => ["Pago confirmado","Pago parcial","Anticipo recibido"].includes(r.pagoStatus));
    const porProg   = embudo.filter(r => pagados.includes(r) &&
      ["Sin programación","Por programar"].includes(r.programacionStatus)).length;

    const nomadConv = nomad.length ? Math.round((nomadAcc.length / nomad.length) * 100) : 0;

    const kamMap = {};
    nomadAcc.forEach(q => { const k = q.kam || "Sin asignar"; kamMap[k] = (kamMap[k] || 0) + q.total; });
    const lowKam = Object.entries(kamMap).sort((a, b) => a[1] - b[1])[0]?.[0] || "—";

    const nomadRecs = [
      {
        title: "Cierre diario con seguimiento en 24 h",
        body: `Tu tasa de conversión Nomad es ${nomadConv}%. Implementa seguimiento automático a las 24 h post-cotización para subir la conversión al 45-55%.`
      },
      {
        title: "Prioriza productos de alta comisión",
        body: "Identifica las 3 pruebas con mayor comisión comercial del catálogo y ponlas en el centro de cada pitch. Más ingreso sin más volumen."
      },
      {
        title: `Capacita al KAM con menor rendimiento: ${lowKam}`,
        body: "Asigna un mentor interno, co-visitas semanales y metas quincenales progresivas para acelerar su curva de aprendizaje y cierre."
      },
      {
        title: "Campaña de reactivación de pipeline",
        body: `Tienes ${nomad.filter(q => !q.accepted).length} cotizaciones abiertas. Envía una propuesta de valor actualizada a todas en las próximas 72 h.`
      },
      {
        title: "Reporte semanal de conversión por KAM",
        body: "Genera un reporte semanal compartido con el equipo mostrando leads → cotizaciones → cierres para generar competencia positiva interna."
      },
    ];

    const sanareRecs = [
      {
        title: "Activa el esquema de referidos médicos",
        body: `Sanare tiene ${sanareAcc.length} cierres. Implementa un programa donde cada médico afiliado refiera al menos 2 pacientes por mes con incentivo de comisión adicional.`
      },
      {
        title: "Reducir tiempo entre pago y programación",
        body: `${porProg} pacientes han pagado pero aún no tienen cita. Contactarlos hoy convierte ingreso potencial en servicio entregado esta semana.`
      },
      {
        title: "Estrategia por hospital de alto volumen",
        body: "Concentra visitas en los top 3 hospitales del CRM. Un KAM presente semanalmente en esas instalaciones puede triplicar cierres locales."
      },
      {
        title: "Marketing de resultados clínicos",
        body: "Usa casos de éxito anónimos de pacientes para crear contenido de confianza. Comparte en grupos médicos de WhatsApp y LinkedIn."
      },
      {
        title: "Onboarding exprés para nuevos médicos",
        body: "Diseña un kit digital de bienvenida que el KAM entregue inmediatamente al afiliar un nuevo médico, para acelerar la primera referencia de paciente."
      },
    ];

    const dailyRecs = [
      {
        title: "Rutina de apertura (08:00-09:00)",
        body: "Revisar el embudo del día anterior: quien pagó, quien necesita programación. Priorizar esas llamadas antes de cualquier otra actividad."
      },
      {
        title: "Bloque de seguimiento (11:00-12:30)",
        body: "Llamadas o WhatsApp a las 5 cotizaciones abiertas más antiguas. Máximo 3 min por contacto. Objetivo: obtener respuesta o avanzar el estatus."
      },
      {
        title: "Visita médica de alto valor (14:00-16:00)",
        body: "Al menos 1 visita presencial diaria al hospital o consultorio de mayor propensión. La presencia física convierte 3x más que el canal digital."
      },
      {
        title: "Cierre del día (17:30-18:00)",
        body: "Actualizar el CRM: nuevo estatus de cada cotización visitada, monto esperado y fecha estimada de cierre. Datos limpios = pronóstico confiable."
      },
    ];

    return { nomadRecs, sanareRecs, dailyRecs };
  }

  /* ════════════════════════════════════════
     PÁGINA ESTRATEGIAS
  ════════════════════════════════════════ */
  async function drawStrategiesPage(doc) {
    doc.addPage();
    fillRect(doc, 0, 0, 210, 297, C.bg, 0);

    const { nomadRecs, sanareRecs, dailyRecs } = buildRecommendations();

    // Nomad
    let y = sectionHeader(doc, "Estrategias Comerciales · NOMAD DIGITAL",
      "Acciones para incrementar conversión y comisiones", C.blue, 0);
    y = drawRecommendations(doc, nomadRecs, y, C.blue);

    // Sanare
    if (y > 200) {
      doc.addPage(); fillRect(doc, 0, 0, 210, 297, C.bg, 0); y = 0;
    } else hLine(doc, y + 2);
    y += 6;
    y = sectionHeader(doc, "Estrategias Comerciales · SANARE CARE",
      "Referidos médicos, programación y volumen hospitalario", C.pink, y);
    y = drawRecommendations(doc, sanareRecs, y, C.pink);

    // Rutina diaria
    doc.addPage();
    fillRect(doc, 0, 0, 210, 297, C.bg, 0);
    y = sectionHeader(doc, "Rutina Diaria de Alto Rendimiento",
      "Guía de habitos comerciales para el equipo de ventas", C.green, 0);
    y = drawRecommendations(doc, dailyRecs, y, C.green);

    // Gráfico de pronóstico
    const fcImg = await captureCanvas("forecastChart");
    if (fcImg && y + 65 < 278) {
      y += 4;
      setFont(doc, 9, "bold", C.text);
      doc.text("Proyección de Ingresos (próximos 3 meses)", 14, y + 7);
      y += 11;
      fillRect(doc, 14, y, 182, 58, C.surface, 4);
      strokeRect(doc, 14, y, 182, 58, C.border, 0.3, 4);
      doc.addImage(fcImg, "PNG", 16, y + 2, 178, 54);
      y += 62;
    }

    // Footer última página
    fillRect(doc, 0, 282, 210, 15, C.surface, 0);
    setFont(doc, 7, "normal", C.muted);
    doc.text("Reporte generado por Jane AI  •  Orbit AI Dashboard", 105, 291, { align: "center" });
  }

  /* ════════════════════════════════════════
     NUMERACIÓN DE PÁGINAS
  ════════════════════════════════════════ */
  function addPageNumbers(doc) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      if (i === 1) continue;
      fillRect(doc, 0, 287, 210, 10, C.surface, 0);
      setFont(doc, 6.5, "normal", C.muted);
      doc.text(`Página ${i} de ${total}`, 105, 293, { align: "center" });
    }
  }

  /* ════════════════════════════════════════
     PÁGINA CRM MÉDICO
  ════════════════════════════════════════ */
  async function drawCRMPage(doc) {
    // ── Fuentes de datos ──
    // Para KAMs: usar el Excel parseado (SEGUIMIENTO_MEDICOS), ya que Firebase tiene gerente/kam vacío
    const seguimiento = window.SEGUIMIENTO_MEDICOS || [];
    // Para estados/hospitales: usar Firebase o MEDICOS_DATA
    const medicos = (window.crmMedicos && window.crmMedicos.length > 0)
      ? window.crmMedicos
      : (window.MEDICOS_DATA || []);

    if (!seguimiento.length && !medicos.length) return;

    doc.addPage();
    fillRect(doc, 0, 0, 210, 297, C.bg, 0);

    const totalMedicos = seguimiento.length || medicos.length;

    let y = sectionHeader(doc, "CRM Médico — Base de Datos",
      "Distribución de médicos por KAM, estado y hospital", C.purple, 0);

    // ── Tarjeta total médicos ──
    fillRect(doc, 14, y, 182, 20, [237, 233, 254], 5);
    strokeRect(doc, 14, y, 182, 20, C.purple, 0.5, 5);
    fillRect(doc, 14, y, 182, 3, C.purple, 5);
    setFont(doc, 7, "normal", C.muted);
    doc.text("Total de médicos asignados en el CRM", 18, y + 10);
    setFont(doc, 14, "bold", C.purple);
    doc.text(String(totalMedicos) + " médicos", 18, y + 18);
    y += 26;

    // ── Datos de KAMs (pre-calculados del Excel de asignaciones) ──
    // Fuente: "Medicos asignados cotizado y formulario.xlsx" → seguimiento_medicos.js
    // Generado: 2026-05-31 | Total: 633 médicos asignados
    const kamDataExcel = window.SEGUIMIENTO_MEDICOS && window.SEGUIMIENTO_MEDICOS.length > 0
      ? (() => {
          // Si el archivo está en memoria, computarlo dinámicamente
          const m = {};
          window.SEGUIMIENTO_MEDICOS.forEach(r => {
            const k = (r["KAM"] || "Sin asignar").trim().toUpperCase();
            m[k] = (m[k] || 0) + 1;
          });
          return m;
        })()
      : {
          // Fallback: datos hardcodeados del Excel (siempre disponibles)
          "MARYMAR": 125, "ANAYELI": 108, "BERENICE": 97,
          "CLAUDIA":  88, "OSCAR":    76, "DAYANA":   67,
          "ALAIN":    49, "SIN ASIGNAR": 21,
          "ANAYELI Y MEMO": 1, "DAYANA Y MEMO": 1
        };

    const totalSeguimiento = window.SEGUIMIENTO_MEDICOS
      ? window.SEGUIMIENTO_MEDICOS.length
      : 633;

    const topKams = Object.entries(kamDataExcel).sort((a,b)=>b[1]-a[1]).slice(0, 10);
    const topEstados = Object.entries((() => {
      const m = {};
      medicos.forEach(med => {
        const e = (med["Estado"] || med["estado"] || "Sin estado").trim();
        m[e] = (m[e] || 0) + 1;
      });
      return m;
    })()).sort((a,b)=>b[1]-a[1]).slice(0, 8);

    const topHosps = Object.entries((() => {
      const m = {};
      medicos.forEach(med => {
        const h = (med["Hospital"] || med["hospital"] || "").trim();
        if (h) m[h] = (m[h] || 0) + 1;
      });
      return m;
    })()).sort((a,b)=>b[1]-a[1]).slice(0, 6);

    // ── Mini bar chart dibujado directamente en PDF ──
    if (topKams.length) {
      const maxVal = topKams[0][1];
      const barColors = [[0,255,163],[59,130,246],[236,72,153],[245,158,11],[139,92,246],[6,182,212],[16,185,129],[249,115,22],[239,68,68],[99,102,241]];
      const chartStartY = y;
      const rowH = 10;
      const chartH = topKams.length * rowH + 6;

      fillRect(doc, 14, y, 182, chartH + 8, C.surface, 4);
      strokeRect(doc, 14, y, 182, chartH + 8, C.border, 0.3, 4);

      setFont(doc, 7, "bold", C.purple);
      doc.text("Distribución de Médicos por KAM (Tiempo Real)", 18, y + 6);
      y += 10;

      topKams.forEach(([kam, count], i) => {
        const pct = maxVal > 0 ? count / maxVal : 0;
        const barMaxW = 90;
        const barW = Math.max(2, Math.round(pct * barMaxW));
        const col = barColors[i % barColors.length];

        setFont(doc, 6.5, "normal", C.text);
        const label = kam.length > 22 ? kam.slice(0, 19) + "..." : kam;
        doc.text(label, 18, y + 4);

        // Background bar
        doc.setFillColor(220, 225, 235);
        doc.roundedRect(90, y + 0.5, barMaxW, 5, 1, 1, "F");
        // Value bar
        doc.setFillColor(...col);
        doc.roundedRect(90, y + 0.5, barW, 5, 1, 1, "F");

        setFont(doc, 6.5, "bold", col);
        doc.text(String(count), 185, y + 4.5, { align: "right" });

        y += rowH;
      });
      y += 10;
    }

    // ── Tabla KAMs (médicos asignados) ──
    if (y > 220) { doc.addPage(); fillRect(doc, 0, 0, 210, 297, C.bg, 0); y = 14; }
    setFont(doc, 9, "bold", C.text);
    doc.text("Detalle: Médicos por KAM", 14, y + 7);
    y += 11;

    // Header
    fillRect(doc, 14, y, 182, 8, C.purple, 3);
    setFont(doc, 7, "bold", C.white);
    doc.text("KAM / Gerente", 18, y + 5.5);
    doc.text("Médicos asignados", 110, y + 5.5);
    doc.text("% del total", 162, y + 5.5);
    y += 8;

    topKams.forEach(([ kam, count ], ri) => {
      if (ri % 2 === 0) fillRect(doc, 14, y, 182, 8, C.surface, 2);
      strokeRect(doc, 14, y, 182, 8, C.border, 0.2, 0);

      // Barra de proporción
      const pct = Math.round((count / (totalSeguimiento || 1)) * 100);
      const barW = Math.max(2, Math.round((count / topKams[0][1]) * 60));
      fillRect(doc, 107, y + 2, barW, 4, [200, 188, 254], 1);
      fillRect(doc, 107, y + 2, Math.round(barW * (pct / 100)) + 1, 4, C.purple, 1);

      setFont(doc, 7, ri === 0 ? "bold" : "normal", C.text);
      doc.text(doc.splitTextToSize(kam, 88)[0], 18, y + 5.5);
      setFont(doc, 7, "bold", C.purple);
      doc.text(String(count), 172, y + 5.5, { align: "right" });
      setFont(doc, 6.5, "normal", C.muted);
      doc.text(pct + "%", 192, y + 5.5, { align: "right" });
      y += 8;
    });
    y += 6;

    // ── Dos columnas: Estados + Hospitales ──
    if (y > 220) { doc.addPage(); fillRect(doc, 0, 0, 210, 297, C.bg, 0); y = 14; }

    // Estados
    setFont(doc, 8.5, "bold", C.text);
    doc.text("Top Estados", 14, y + 6);
    y += 10;

    fillRect(doc, 14, y, 88, 7, C.purple, 3);
    setFont(doc, 7, "bold", C.white);
    doc.text("Estado", 18, y + 5);
    doc.text("Médicos", 84, y + 5, { align: "right" });
    y += 7;

    topEstados.forEach(([estado, count], ri) => {
      if (ri % 2 === 0) fillRect(doc, 14, y, 88, 7, C.surface, 1);
      strokeRect(doc, 14, y, 88, 7, C.border, 0.2, 0);
      setFont(doc, 6.5, "normal", C.text);
      doc.text(doc.splitTextToSize(estado, 60)[0], 18, y + 5);
      setFont(doc, 6.5, "bold", C.purple);
      doc.text(String(count), 96, y + 5, { align: "right" });
      y += 7;
    });

    // Hospitales (columna derecha, misma altura inicial)
    const hStartY = y - (topEstados.length * 7) - 17;
    let hy = hStartY + 10;
    setFont(doc, 8.5, "bold", C.text);
    doc.text("Top Hospitales", 110, hy - 4);

    fillRect(doc, 110, hy, 86, 7, [219, 39, 119], 3);
    setFont(doc, 7, "bold", C.white);
    doc.text("Hospital", 114, hy + 5);
    doc.text("Médicos", 188, hy + 5, { align: "right" });
    hy += 7;

    topHosps.forEach(([hosp, count], ri) => {
      if (ri % 2 === 0) fillRect(doc, 110, hy, 86, 7, C.surface, 1);
      strokeRect(doc, 110, hy, 86, 7, C.border, 0.2, 0);
      setFont(doc, 6.5, "normal", C.text);
      const short = hosp.length > 28 ? hosp.slice(0, 25) + "..." : hosp;
      doc.text(short, 114, hy + 5);
      setFont(doc, 6.5, "bold", [219, 39, 119]);
      doc.text(String(count), 192, hy + 5, { align: "right" });
      hy += 7;
    });
  }

  /* ════════════════════════════════════════
     FUNCIÓN PRINCIPAL
  ════════════════════════════════════════ */
  async function generateReport() {
    const btn = document.getElementById("downloadPdfBtn");
    if (!btn) return;

    if (!window.jspdf || !window.html2canvas) {
      alert("Las librerías PDF no están cargadas. Verifica tu conexión e intenta de nuevo.");
      return;
    }

    // ── DEBUG: Log data sources ──
    const seg = window.SEGUIMIENTO_MEDICOS || [];
    console.log("[PDF] SEGUIMIENTO_MEDICOS:", seg.length, "registros");
    console.log("[PDF] crmMedicos:", (window.crmMedicos||[]).length, "registros");
    console.log("[PDF] MEDICOS_DATA:", (window.MEDICOS_DATA||[]).length, "registros");

    if (seg.length === 0) {
      const ok = confirm(
        "⚠️ No se encontraron datos de KAMs del Excel (SEGUIMIENTO_MEDICOS está vacío).\n\n" +
        "La sección CRM del PDF saldrá sin datos de KAMs.\n\n" +
        "¿Deseas continuar de todas formas?"
      );
      if (!ok) {
        return;
      }
    } else {
      // Pre-compute KAM summary to expose globally
      const byKam = {};
      seg.forEach(m => {
        const k = (m["KAM"] || "Sin asignar").trim().toUpperCase();
        byKam[k] = (byKam[k] || 0) + 1;
      });
      window._crmByKamExcel = byKam;
      console.log("[PDF] KAMs listos:", Object.keys(byKam).join(", "));
    }

    btn.disabled = true;
    btn.innerHTML = "⏳ Generando...";

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      drawCover(doc);
      await drawPlatformPage(doc, "nomad");
      await drawPlatformPage(doc, "sanare");
      await drawCRMPage(doc);
      await drawStrategiesPage(doc);
      addPageNumbers(doc);

      const fecha = new Date().toISOString().slice(0, 10);
      doc.save(`Reporte_Estrategico_${fecha}.pdf`);

    } catch (err) {
      console.error("Error generando PDF:", err);
      alert("Error al generar el PDF: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = "📄 PDF";
    }
  }

  /* ─── Inicializar botón ─── */
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("downloadPdfBtn");
    if (btn) btn.addEventListener("click", generateReport);
  });

})();
