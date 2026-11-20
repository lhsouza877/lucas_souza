const STORAGE_KEY = "polimix-calibracao-balancas-v1";
const MAX_POINTS = 12;

const form = document.querySelector("#calibration-form");
const rowsContainer = document.querySelector("#measurement-rows");
const historyList = document.querySelector("#history-list");
const formMessage = document.querySelector("#form-message");
const storageStatus = document.querySelector("#storage-status");
const selectedRecordIds = new Set();
let activeRecordId = null;

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    storageStatus.textContent = "Não foi possível ler o histórico";
    return [];
  }
}

function writeRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    storageStatus.textContent = "Salvo neste navegador";
    return true;
  } catch {
    storageStatus.textContent = "Falha ao salvar neste navegador";
    formMessage.textContent = "Não foi possível salvar. Verifique o espaço disponível no navegador.";
    return false;
  }
}

function parseValue(value) {
  const normalized = String(value).trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

function createPointRow(index, point = {}) {
  const row = document.createElement("div");
  row.className = "measurement-row";
  row.dataset.point = String(index);
  const number = document.createElement("span");
  number.className = "point-number";
  number.textContent = String(index + 1).padStart(2, "0");
  row.append(number);

  const fields = [
    ["tare", "Tara", point.tare],
    ["requested", "Pedido", point.requested],
    ["actual", "Peso real", point.actual],
  ];
  for (const [name, label, value] of fields) {
    const input = document.createElement("input");
    input.className = "measurement-input";
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "0,00";
    input.setAttribute("aria-label", `${label}, ponto ${index + 1}`);
    input.dataset.field = name;
    if (value !== undefined && value !== null) input.value = String(value).replace(".", ",");
    row.append(input);
  }

  const netWeight = document.createElement("output");
  netWeight.className = "computed-value";
  netWeight.dataset.computed = "net-weight";
  netWeight.textContent = "—";
  row.append(netWeight);

  const error = document.createElement("output");
  error.className = "computed-value computed-error";
  error.dataset.computed = "error";
  error.textContent = "—";
  row.append(error);

  const remove = document.createElement("button");
  remove.className = "remove-point";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remover ponto ${index + 1}`);
  row.append(remove);
  return row;
}

function renumberRows() {
  [...rowsContainer.children].forEach((row, index) => {
    row.dataset.point = String(index);
    row.querySelector(".point-number").textContent = String(index + 1).padStart(2, "0");
    row.querySelectorAll("[data-field]").forEach((input) => {
      const labels = { tare: "Tara", requested: "Pedido", actual: "Peso real" };
      input.setAttribute("aria-label", `${labels[input.dataset.field]}, ponto ${index + 1}`);
    });
    row.querySelector(".remove-point").setAttribute("aria-label", `Remover ponto ${index + 1}`);
  });
  document.querySelector("#add-point-button").disabled = rowsContainer.children.length >= MAX_POINTS;
}

function calculateRow(row) {
  const values = Object.fromEntries([...row.querySelectorAll("[data-field]")].map((input) => [input.dataset.field, parseValue(input.value)]));
  const netWeightOutput = row.querySelector('[data-computed="net-weight"]');
  const error = row.querySelector('[data-computed="error"]');
  const isComplete = Object.values(values).every((value) => value !== null);
  if (!isComplete || values.requested <= 0) {
    netWeightOutput.textContent = "—";
    error.textContent = "—";
    error.classList.remove("positive", "negative");
    row.dataset.complete = "false";
    row.dataset.invalidNetWeight = "false";
    return null;
  }

  const netWeight = values.actual - values.tare;
  netWeightOutput.textContent = formatNumber(netWeight);
  if (netWeight <= 0) {
    error.textContent = "N/D";
    error.classList.remove("positive", "negative");
    row.dataset.complete = "false";
    row.dataset.invalidNetWeight = "true";
    return null;
  }

  const errorPercent = ((netWeight - values.requested) / netWeight) * 100;
  error.textContent = `${errorPercent > 0 ? "+" : ""}${formatNumber(errorPercent)}%`;
  error.classList.toggle("positive", errorPercent > 0);
  error.classList.toggle("negative", errorPercent < 0);
  row.dataset.complete = "true";
  row.dataset.invalidNetWeight = "false";
  return { ...values, netWeight, errorPercent };
}

function getMeasurementData() {
  const points = [];
  let hasPartialPoint = false;
  let hasInvalidNetWeight = false;
  [...rowsContainer.children].forEach((row) => {
    const result = calculateRow(row);
    const anyFilled = [...row.querySelectorAll("[data-field]")].some((input) => input.value.trim() !== "");
    if (result) points.push(result);
    else if (anyFilled) hasPartialPoint = true;
    if (row.dataset.invalidNetWeight === "true") hasInvalidNetWeight = true;
  });
  return { points, hasPartialPoint, hasInvalidNetWeight };
}

function updateSummary() {
  const { points } = getMeasurementData();
  const average = points.length ? points.reduce((sum, point) => sum + Math.abs(point.errorPercent), 0) / points.length : null;
  document.querySelector("#summary-points").textContent = String(points.length);
  document.querySelector("#summary-average").textContent = average === null ? "—" : formatNumber(average);
  document.querySelector("#summary-records").textContent = String(readRecords().length);
}

function formatDate(value) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function makeHistoryCard(record) {
  const card = document.createElement("article");
  card.className = "history-card";
  const heading = document.createElement("div");
  heading.className = "history-card-title";
  const title = document.createElement("strong");
  title.textContent = record.material;
  const date = document.createElement("time");
  date.dateTime = record.date;
  date.textContent = formatDate(record.date);
  heading.append(title, date);
  const meta = document.createElement("p");
  meta.className = "history-card-meta";
  meta.textContent = `${record.scale} · ${record.points.length} ${record.points.length === 1 ? "ponto" : "pontos"}`;
  const actions = document.createElement("div");
  actions.className = "history-actions";
  const selectLabel = document.createElement("label");
  selectLabel.className = "history-select";
  const select = document.createElement("input");
  select.type = "checkbox";
  select.checked = selectedRecordIds.has(record.id);
  select.dataset.recordSelect = "";
  select.dataset.recordId = record.id;
  select.setAttribute("aria-label", `Incluir ${record.material}, ${formatDate(record.date)}, no PDF`);
  selectLabel.append(select, document.createTextNode("PDF"));
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = activeRecordId === record.id ? "Em edição" : "Abrir";
  open.disabled = activeRecordId === record.id;
  open.addEventListener("click", () => loadRecord(record));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Excluir";
  remove.addEventListener("click", () => deleteRecord(record.id));
  actions.append(selectLabel, open, remove);
  card.append(heading, meta, actions);
  return card;
}

function updateSelectionControls(filteredRecords) {
  const selectVisible = document.querySelector("#select-visible-records");
  const selectedVisibleCount = filteredRecords.filter((record) => selectedRecordIds.has(record.id)).length;
  selectVisible.checked = filteredRecords.length > 0 && selectedVisibleCount === filteredRecords.length;
  selectVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filteredRecords.length;
  selectVisible.disabled = filteredRecords.length === 0;
  const selectedCount = selectedRecordIds.size;
  document.querySelector("#selection-count").textContent = `${selectedCount} ${selectedCount === 1 ? "histórico selecionado" : "históricos selecionados"}`;
}

function renderHistory() {
  const records = readRecords().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const recordIds = new Set(records.map((record) => record.id));
  for (const id of selectedRecordIds) {
    if (!recordIds.has(id)) selectedRecordIds.delete(id);
  }
  const query = document.querySelector("#history-search").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = records.filter((record) => `${record.material} ${record.scale} ${record.operator || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  historyList.replaceChildren(...filtered.map(makeHistoryCard));
  updateSelectionControls(filtered);
  document.querySelector("#history-count").textContent = String(records.length);
  document.querySelector("#empty-history").hidden = filtered.length > 0;
  document.querySelector("#empty-history").textContent = records.length && !filtered.length ? "Nenhum registro corresponde à busca." : "As calibrações salvas neste navegador aparecerão aqui.";
  document.querySelector("#summary-records").textContent = String(records.length);
  if (!activeRecordId) document.querySelector("#record-index").textContent = String(records.length + 1).padStart(2, "0");
}

function resetForm() {
  form.reset();
  activeRecordId = null;
  document.querySelector("#calibration-date").value = localDateValue();
  document.querySelector("#record-index").textContent = String(readRecords().length + 1).padStart(2, "0");
  document.querySelector("#form-title").textContent = "Novo registro";
  document.querySelector("#save-button").textContent = "Salvar calibração";
  rowsContainer.replaceChildren(createPointRow(0));
  formMessage.textContent = "";
  renderHistory();
  updateSummary();
}

function loadRecord(record) {
  activeRecordId = record.id;
  document.querySelector("#calibration-date").value = record.date || localDateValue();
  document.querySelector("#material").value = record.material || "Clínquer";
  document.querySelector("#scale-id").value = record.scale || "";
  document.querySelector("#weight-unit").value = record.unit || "kg";
  document.querySelector("#operator").value = record.operator || "";
  document.querySelector("#notes").value = record.notes || "";
  rowsContainer.replaceChildren(...record.points.map((point, index) => createPointRow(index, point)));
  document.querySelector("#record-index").textContent = "ED";
  document.querySelector("#form-title").textContent = "Editar registro";
  document.querySelector("#save-button").textContent = "Atualizar calibração";
  formMessage.textContent = "";
  renumberRows();
  renderHistory();
  updateSummary();
  document.querySelector("#form-title").scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteRecord(id) {
  if (!window.confirm("Excluir esta calibração do histórico deste navegador?")) return;
  const records = readRecords().filter((record) => record.id !== id);
  if (!writeRecords(records)) return;
  selectedRecordIds.delete(id);
  if (activeRecordId === id) resetForm();
  renderHistory();
  updateSummary();
}

function buildRecord() {
  const { points, hasPartialPoint, hasInvalidNetWeight } = getMeasurementData();
  if (!form.reportValidity()) return null;
  if (hasInvalidNetWeight) {
    formMessage.textContent = "O peso real deve ser maior que a tara para calcular um peso líquido positivo.";
    return null;
  }
  if (hasPartialPoint) {
    formMessage.textContent = "Complete tara, pedido e peso real em cada ponto iniciado.";
    return null;
  }
  if (!points.length) {
    formMessage.textContent = "Preencha pelo menos um ponto de medição.";
    return null;
  }
  if (points.some((point) => point.tare < 0 || point.requested <= 0 || point.actual < 0)) {
    formMessage.textContent = "Tara e peso real não podem ser negativos; o pedido deve ser maior que zero.";
    return null;
  }
  const existing = readRecords().find((record) => record.id === activeRecordId);
  return {
    id: activeRecordId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    date: document.querySelector("#calibration-date").value,
    material: document.querySelector("#material").value,
    scale: document.querySelector("#scale-id").value.trim(),
    unit: document.querySelector("#weight-unit").value,
    operator: document.querySelector("#operator").value.trim(),
    notes: document.querySelector("#notes").value.trim(),
    points,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function exportPdf() {
  const records = readRecords();
  if (!records.length) {
    formMessage.textContent = "Ainda não há registros para exportar.";
    return;
  }
  const selectedRecords = records.filter((record) => selectedRecordIds.has(record.id));
  if (!selectedRecords.length) {
    formMessage.textContent = "Selecione ao menos um histórico para exportar.";
    return;
  }
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    formMessage.textContent = "Permita pop-ups para gerar o PDF.";
    return;
  }

  const recordSections = selectedRecords.map((record) => {
    const points = (record.points || []).map((point, index) => {
      const netWeight = Number(point.actual) - Number(point.tare);
      const errorPercent = netWeight > 0
        ? ((netWeight - Number(point.requested)) / netWeight) * 100
        : null;
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatNumber(Number(point.tare)))}</td>
        <td>${escapeHtml(formatNumber(Number(point.requested)))}</td>
        <td>${escapeHtml(formatNumber(Number(point.actual)))}</td>
        <td>${escapeHtml(formatNumber(netWeight))}</td>
        <td>${errorPercent === null ? "N/D" : `${escapeHtml(formatNumber(errorPercent))}%`}</td>
      </tr>`;
    }).join("");
    return `<section class="record">
      <h2>${escapeHtml(record.material)} — ${escapeHtml(formatDate(record.date))}</h2>
      <p><strong>Balança:</strong> ${escapeHtml(record.scale)} &nbsp; <strong>Unidade:</strong> ${escapeHtml(record.unit || "kg")}</p>
      <p><strong>Responsável:</strong> ${escapeHtml(record.operator || "Não informado")}</p>
      <table>
        <thead><tr><th>Ponto</th><th>Tara</th><th>Pedido</th><th>Peso real (bruto)</th><th>Peso líquido</th><th>Erro %</th></tr></thead>
        <tbody>${points}</tbody>
      </table>
      ${record.notes ? `<p><strong>Observações:</strong> ${escapeHtml(record.notes)}</p>` : ""}
    </section>`;
  }).join("");

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Calibração de balanças</title>
      <style>
        body { font: 12px Arial, sans-serif; color: #222; margin: 24px; }
        h1 { font-size: 22px; margin-bottom: 6px; }
        .formula { margin: 0 0 22px; color: #444; }
        .record { margin: 0 0 24px; break-inside: avoid; }
        .record h2 { font-size: 16px; margin: 0 0 8px; }
        .record p { margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 7px; border: 1px solid #bbb; text-align: left; }
        th { background: #eee; }
        @page { margin: 16mm; }
      </style>
    </head>
    <body>
      <h1>Relatório de calibração de balanças</h1>
      <p class="formula">Peso líquido = peso real − tara. Erro (%) = ((peso líquido − pedido) / peso líquido) × 100.</p>
      ${recordSections}
    </body>
    </html>`);
  reportWindow.document.close();
  window.setTimeout(() => {
    if (reportWindow.closed) return;
    reportWindow.focus();
    reportWindow.print();
  }, 300);
  formMessage.textContent = "Na janela de impressão, escolha “Salvar como PDF”.";
}

document.querySelector("#add-point-button").addEventListener("click", () => {
  if (rowsContainer.children.length >= MAX_POINTS) return;
  rowsContainer.append(createPointRow(rowsContainer.children.length));
  renumberRows();
  updateSummary();
  rowsContainer.lastElementChild.querySelector("input").focus();
});

rowsContainer.addEventListener("input", () => {
  updateSummary();
  formMessage.textContent = "";
});

rowsContainer.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-point");
  if (!removeButton) return;
  if (rowsContainer.children.length === 1) {
    rowsContainer.firstElementChild.querySelectorAll("[data-field]").forEach((input) => { input.value = ""; });
  } else {
    removeButton.closest(".measurement-row").remove();
  }
  renumberRows();
  updateSummary();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  const record = buildRecord();
  if (!record) return;
  const records = readRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) records.push(record);
  else records[index] = record;
  if (!writeRecords(records)) return;
  resetForm();
  formMessage.textContent = "Calibração salva neste navegador.";
}
);

document.querySelector("#new-record-button").addEventListener("click", resetForm);
document.querySelector("#export-button").addEventListener("click", exportPdf);
document.querySelector("#history-search").addEventListener("input", renderHistory);
historyList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-record-select]");
  if (!checkbox) return;
  if (checkbox.checked) selectedRecordIds.add(checkbox.dataset.recordId);
  else selectedRecordIds.delete(checkbox.dataset.recordId);
  const query = document.querySelector("#history-search").value.trim().toLocaleLowerCase("pt-BR");
  const visibleRecords = readRecords().filter((record) => `${record.material} ${record.scale} ${record.operator || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  updateSelectionControls(visibleRecords);
});
document.querySelector("#select-visible-records").addEventListener("change", (event) => {
  const visibleIds = [...historyList.querySelectorAll("[data-record-select]")].map((checkbox) => checkbox.dataset.recordId);
  for (const id of visibleIds) {
    if (event.target.checked) selectedRecordIds.add(id);
    else selectedRecordIds.delete(id);
  }
  renderHistory();
});

resetForm();