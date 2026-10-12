const STORAGE_KEY = "polimix-calibracao-balancas-v1";
const MAX_POINTS = 12;

const form = document.querySelector("#calibration-form");
const rowsContainer = document.querySelector("#measurement-rows");
const historyList = document.querySelector("#history-list");
const formMessage = document.querySelector("#form-message");
const storageStatus = document.querySelector("#storage-status");
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

  const ideal = document.createElement("output");
  ideal.className = "computed-value";
  ideal.dataset.computed = "ideal";
  ideal.textContent = "—";
  row.append(ideal);

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
  const ideal = row.querySelector('[data-computed="ideal"]');
  const error = row.querySelector('[data-computed="error"]');
  const isComplete = Object.values(values).every((value) => value !== null);
  if (!isComplete || values.requested <= 0) {
    ideal.textContent = "—";
    error.textContent = "—";
    error.classList.remove("positive", "negative");
    row.dataset.complete = "false";
    return null;
  }

  const idealWeight = values.tare + values.requested;
  const errorPercent = ((values.actual - idealWeight) / values.requested) * 100;
  ideal.textContent = formatNumber(idealWeight);
  error.textContent = `${errorPercent > 0 ? "+" : ""}${formatNumber(errorPercent)}%`;
  error.classList.toggle("positive", errorPercent > 0);
  error.classList.toggle("negative", errorPercent < 0);
  row.dataset.complete = "true";
  return { ...values, ideal: idealWeight, errorPercent };
}

function getMeasurementData() {
  const points = [];
  let hasPartialPoint = false;
  [...rowsContainer.children].forEach((row) => {
    const result = calculateRow(row);
    const anyFilled = [...row.querySelectorAll("[data-field]")].some((input) => input.value.trim() !== "");
    if (result) points.push(result);
    else if (anyFilled) hasPartialPoint = true;
  });
  return { points, hasPartialPoint };
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
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = activeRecordId === record.id ? "Em edição" : "Abrir";
  open.disabled = activeRecordId === record.id;
  open.addEventListener("click", () => loadRecord(record));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Excluir";
  remove.addEventListener("click", () => deleteRecord(record.id));
  actions.append(open, remove);
  card.append(heading, meta, actions);
  return card;
}

function renderHistory() {
  const records = readRecords().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  const query = document.querySelector("#history-search").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = records.filter((record) => `${record.material} ${record.scale} ${record.operator || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  historyList.replaceChildren(...filtered.map(makeHistoryCard));
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
  if (activeRecordId === id) resetForm();
  renderHistory();
  updateSummary();
}

function buildRecord() {
  const { points, hasPartialPoint } = getMeasurementData();
  if (!form.reportValidity()) return null;
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

function exportCsv() {
  const records = readRecords();
  if (!records.length) {
    formMessage.textContent = "Ainda não há registros para exportar.";
    return;
  }
  const header = ["Data", "Material", "Balança", "Unidade", "Responsável", "Ponto", "Tara", "Pedido", "Peso ideal", "Peso real", "Erro %", "Observações"];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [header.map(escape).join(";")];
  for (const record of records) {
    for (const [index, point] of record.points.entries()) {
      lines.push([record.date, record.material, record.scale, record.unit, record.operator, index + 1, point.tare, point.requested, point.ideal, point.actual, point.errorPercent, record.notes].map(escape).join(";"));
    }
  }
  const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `calibracao-balancas-${localDateValue()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  formMessage.textContent = "";
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
document.querySelector("#export-button").addEventListener("click", exportCsv);
document.querySelector("#history-search").addEventListener("input", renderHistory);

resetForm();