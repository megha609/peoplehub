import ExcelJS from "exceljs";
import {
  normalizeComparisonName,
  normalizeDisplayName,
} from "./employeeName.js";

const employeeStatuses = ["Active", "Inactive"];
const headerAliases = {
  name: "name",
  employeename: "name",
  fullname: "name",
  firstname: "firstName",
  secondname: "secondName",
  thirdname: "thirdName",
  role: "role",
  jobrole: "role",
  employeerole: "role",
  godown: "godown",
  warehouse: "godown",
  department: "department",
  status: "status",
  employmentstatus: "status",
  employeestatus: "status",
};

self.addEventListener("message", async ({ data }) => {
  try {
    const result =
      data.type === "template"
        ? await createTemplate()
        : data.type === "report"
          ? await createAttendanceReport(data)
          : await parseWorkbook(
              data.fileBuffer,
              data.existingEmployees,
              data.catalogs,
            );
    if (result instanceof ArrayBuffer) {
      self.postMessage({ type: "success", result }, [result]);
    } else {
      self.postMessage({ type: "success", result });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not process this Excel workbook.",
    });
  }
});

async function createTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleHub";
  const worksheet = workbook.addWorksheet("Employees");
  worksheet.columns = [
    { header: "Name", key: "name", width: 32 },
    { header: "Role", key: "role", width: 20 },
    { header: "Godown", key: "godown", width: 38 },
    { header: "Department", key: "department", width: 24 },
    { header: "Status", key: "status", width: 18 },
  ];
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = "A1:E1";
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF11765F" },
  };
  const buffer = await workbook.xlsx.writeBuffer();
  const arrayBuffer =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
  return arrayBuffer;
}

async function createAttendanceReport({
  from,
  to,
  godown,
  records,
  statuses,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleHub";

  const summary = workbook.addWorksheet("Summary");
  summary.mergeCells("A1:B1");
  summary.getCell("A1").value = "PeopleHub Attendance Report";
  summary.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };
  summary.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF11765F" },
  };
  summary.getRow(1).height = 28;
  summary.columns = [
    { key: "label", width: 30 },
    { key: "value", width: 34 },
  ];
  summary.addRows([
    [],
    ["Start date", from],
    ["End date", to],
    ["Godown", godown],
    [],
    ["Total attendance records", records.length],
    [],
    ["Status", "Count"],
    ...statuses.map((status) => [
      status,
      records.filter((record) => record.status === status).length,
    ]),
  ]);
  summary.getRow(9).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(9).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF11765F" },
  };
  for (const rowNumber of [3, 4]) {
    summary.getCell(rowNumber, 2).numFmt = "dd mmm yyyy";
    summary.getCell(rowNumber, 2).value = new Date(
      `${summary.getCell(rowNumber, 2).value}T00:00:00Z`,
    );
  }
  summary.getColumn(1).font = { bold: true, color: { argb: "FF29434A" } };
  summary.getRow(9).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const details = workbook.addWorksheet("Attendance Details");
  details.columns = [
    { header: "DATE", key: "date", width: 18 },
    { header: "EMPLOYEE", key: "employee", width: 32 },
    { header: "GODOWN", key: "godown", width: 36 },
    { header: "STATUS", key: "status", width: 18 },
  ];
  details.views = [{ state: "frozen", ySplit: 1 }];
  details.autoFilter = "A1:D1";
  details.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  details.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF11765F" },
  };
  for (const record of records) {
    details.addRow({
      date: new Date(`${record.date}T00:00:00Z`),
      employee: record.employeeName || "Unknown employee",
      godown: record.godown || "Unknown godown",
      status: record.status,
    });
  }
  details.getColumn("date").numFmt = "dd mmm yyyy";

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof ArrayBuffer
    ? buffer
    : buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
}

async function parseWorkbook(fileBuffer, existingEmployees, catalogs) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(fileBuffer);
  } catch {
    throw new Error("This file is not a valid .xlsx workbook or is malformed.");
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("The workbook does not contain an employee worksheet.");
  }

  const columns = resolveColumns(worksheet);
  const existingKeys = new Set(
    existingEmployees
      .filter((employee) => typeof employee.name === "string")
      .map((employee) => normalizeComparisonName(employee.name)),
  );
  const uploadedKeys = new Set();
  const rows = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const raw = {
      name: readCell(row, columns.name),
      firstName: readCell(row, columns.firstName),
      secondName: readCell(row, columns.secondName),
      thirdName: readCell(row, columns.thirdName),
      role: readCell(row, columns.role),
      godown: readCell(row, columns.godown),
      department: readCell(row, columns.department),
      status: readCell(row, columns.status),
    };
    if (Object.values(raw).every((value) => !value)) continue;

    const nameInput = columns.name
      ? raw.name
      : [raw.firstName, raw.secondName, raw.thirdName].filter(Boolean).join(" ");
    const name = normalizeDisplayName(nameInput);
    const role = findCatalogValue(raw.role, catalogs?.jobRoles);
    const godown = findCatalogValue(raw.godown, catalogs?.godowns);
    const department = raw.department
      ? findCatalogValue(raw.department, catalogs?.departments)
      : null;
    const status = findConfiguredValue(raw.status, employeeStatuses);
    const errors = [];
    if (!name) errors.push("Name is required.");
    if (!role) errors.push("Job role must match an active configured job role.");
    if (!godown) errors.push("Godown must match an active configured godown.");
    if (raw.department && !department) {
      errors.push("Department must match an active configured department.");
    }
    if (!status) errors.push("Status must be Active or Inactive.");

    let duplicate = null;
    if (errors.length === 0) {
      const key = normalizeComparisonName(name);
      if (uploadedKeys.has(key)) {
        duplicate = "upload";
      } else if (existingKeys.has(key)) {
        duplicate = "existing";
      }
      uploadedKeys.add(key);
    }

    rows.push({
      rowNumber,
      employee: {
        name,
        role: role?.name || raw.role,
        roleId: role?.id || "",
        godown: godown?.name || raw.godown,
        godownId: godown?.id || "",
        department: department?.name || "",
        departmentId: department?.id || "",
        status: status || raw.status,
      },
      errors,
      duplicate,
    });
  }
  return rows;
}

function resolveColumns(worksheet) {
  const columns = {};
  const headings = worksheet.getRow(1);
  for (
    let columnNumber = 1;
    columnNumber <= headings.cellCount;
    columnNumber += 1
  ) {
    const heading = normalizeHeader(readCell(headings, columnNumber));
    const field = headerAliases[heading];
    if (!field) continue;
    if (columns[field]) {
      throw new Error(
        `The heading "${readCell(headings, columnNumber)}" duplicates another ${field} column.`,
      );
    }
    columns[field] = columnNumber;
  }

  const hasFullName = Boolean(columns.name);
  const hasSplitName = Boolean(
    columns.firstName || columns.secondName || columns.thirdName,
  );
  if (hasFullName && hasSplitName) {
    throw new Error("Use either a Name column or separate First Name and Second Name columns, not both.");
  }
  if (!hasFullName && !(columns.firstName && columns.secondName)) {
    throw new Error("Missing name columns. Include Name, or both First Name and Second Name.");
  }
  const missing = ["role", "godown", "status"].filter((field) => !columns[field]);
  if (missing.length) {
    throw new Error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  }
  return columns;
}

function readCell(row, columnNumber) {
  if (!columnNumber) return "";
  const cell = row.getCell(columnNumber);
  if (cell.value == null) return "";
  if (typeof cell.value === "string" || typeof cell.value === "number") {
    return String(cell.value).trim();
  }
  return typeof cell.text === "string" ? cell.text.trim() : "";
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findConfiguredValue(value, allowedValues) {
  const normalized = normalizeDisplayName(value).toLowerCase();
  return allowedValues.find((allowed) => allowed.toLowerCase() === normalized) || "";
}

function findCatalogValue(input, catalog) {
  if (!input || !catalog || typeof catalog !== "object") return null;
  const normalized = normalizeComparisonName(input);
  for (const [id, entry] of Object.entries(catalog)) {
    if (entry?.active !== true) continue;
    if (
      [entry.name, ...(entry.legacyAliases || [])].some(
        (name) =>
          typeof name === "string" &&
          normalizeComparisonName(name) === normalized,
      )
    ) {
      return { id, name: entry.name };
    }
  }
  return null;
}
