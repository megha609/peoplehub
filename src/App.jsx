import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
  Menu,
  Search,
  Bell,
  ChevronRight,
  Warehouse,
  Plus,
  Download,
  Filter,
  Pencil,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  Clock3,
  CircleCheck,
  CircleX,
  CalendarClock,
  X,
  Save,
  Trash2,
  ArrowUpRight,
  Building2,
  History,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  catalogEntries,
  createCatalogId,
  findCatalogEntryByName,
  seededOrgCatalogs,
} from "./orgConfig";
import {
  runEmployeeWorkbookWorker,
  runReportWorkbookWorker,
} from "./employeeImport";
import { normalizeComparisonName } from "./employeeName";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  or,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db, staffAccountAuth } from "./firebase";

const fmt = (n) => String(n).padStart(2, "0");
const today = getLocalDateString();
const SUPER_ADMIN_UIDS = ["ZYa131iL8AYn5fAZauhDH5R3ody2"];
const statuses = ["Present", "Absent", "Sick", "On Leave", "Overtime"];
const attendancePageSize = 50;
const employeeAuditPageSize = 20;
const titleMap = {
  "/": "Overview",
  "/employees": "Employee register",
  "/employees/:employeeId": "Employee profile",
  "/attendance": "Daily attendance",
  "/calendar": "Attendance calendar",
  "/reports": "Reports",
  "/users": "User management",
  "/users/new": "Create staff account",
  "/settings": "Settings",
};

function normalizeOrgCatalogs(value) {
  const normalizeCatalog = (catalog) =>
    Object.fromEntries(
      Object.entries(catalog && typeof catalog === "object" ? catalog : {})
        .filter(
          ([id, entry]) =>
            typeof id === "string" &&
            entry &&
            typeof entry.name === "string" &&
            typeof entry.active === "boolean",
        )
        .map(([id, entry]) => [
          id,
          {
            name: entry.name.trim(),
            active: entry.active,
            ...(Array.isArray(entry.legacyAliases)
              ? {
                  legacyAliases: [
                    ...new Set(
                      entry.legacyAliases.filter(
                        (alias) => typeof alias === "string" && alias.trim(),
                      ),
                    ),
                  ],
                }
              : {}),
          },
        ]),
    );
  return {
    schemaVersion: 1,
    godowns: normalizeCatalog(value?.godowns),
    jobRoles: normalizeCatalog(value?.jobRoles),
    departments: normalizeCatalog(value?.departments),
  };
}

function mergeCatalogChanges(previous, latest, next) {
  const merged = { ...latest, schemaVersion: 1 };
  for (const category of ["godowns", "jobRoles", "departments"]) {
    const result = { ...latest[category] };
    const ids = new Set([
      ...Object.keys(previous[category]),
      ...Object.keys(next[category]),
    ]);
    for (const id of ids) {
      const before = previous[category][id];
      const after = next[category][id];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      if (after) result[id] = after;
      else delete result[id];
    }
    merged[category] = result;
  }
  return merged;
}

function createReportAttendanceQuery(
  from,
  to,
  scopedGodown,
  godownNames = [],
  cursor = null,
) {
  const constraints = [
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date", "desc"),
    limit(attendancePageSize),
  ];
  if (scopedGodown !== "All godowns") {
    constraints.unshift(
      godownNames.length > 1
        ? where("godown", "in", godownNames)
        : where("godown", "==", godownNames[0] || scopedGodown),
    );
  }
  if (cursor) constraints.push(startAfter(cursor));
  return query(collection(db, "attendance"), ...constraints);
}

function getGodownNames(catalogs, godown) {
  const entry = findCatalogEntryByName(catalogs.godowns, godown);
  return entry
    ? [...new Set([entry.name, ...(entry.legacyAliases || [])])]
    : [godown];
}

function createEmployeeAuditQuery(
  employeeId,
  role,
  godown,
  godownId,
  range,
  cursor = null,
) {
  const constraints = [where("employeeId", "==", String(employeeId))];
  if (role === "Staff") {
    constraints.push(
      godownId
        ? or(where("godown", "==", godown), where("godownId", "==", godownId))
        : where("godown", "==", godown),
    );
  }
  if (range.from) {
    constraints.push(where("changedAt", ">=", localDateBoundary(range.from)));
  }
  if (range.to) {
    constraints.push(where("changedAt", "<", localDateBoundary(range.to, 1)));
  }
  constraints.push(orderBy("changedAt", "desc"));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(employeeAuditPageSize + 1));
  return query(collection(db, "attendanceAudit"), ...constraints);
}

function App() {
  const [userAccounts, setUserAccounts] = useState([]);
  const [staffAccountsLoading, setStaffAccountsLoading] = useState(false);
  const [staffAccountsError, setStaffAccountsError] = useState("");
  const [updatingStaffAccountId, setUpdatingStaffAccountId] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [activeGodown, setActiveGodown] = useState("All godowns");
  const [activeDepartmentId, setActiveDepartmentId] =
    useState("All departments");
  const [orgCatalogs, setOrgCatalogs] = useState(seededOrgCatalogs);
  const [orgCatalogStored, setOrgCatalogStored] = useState(false);
  const [orgCatalogLoading, setOrgCatalogLoading] = useState(false);
  const [orgCatalogError, setOrgCatalogError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState("");
  const [employeeTemplateLoading, setEmployeeTemplateLoading] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [calendarDataScopeKey, setCalendarDataScopeKey] = useState("");
  const [calendarDataQueryKey, setCalendarDataQueryKey] = useState("");
  const [calendarErrorQueryKey, setCalendarErrorQueryKey] = useState("");
  const [reportAttendance, setReportAttendance] = useState([]);
  const [reportDataScopeKey, setReportDataScopeKey] = useState("");
  const [reportDataQueryKey, setReportDataQueryKey] = useState("");
  const [reportErrorQueryKey, setReportErrorQueryKey] = useState("");
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [dailyDataKey, setDailyDataKey] = useState("");
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [reportAttendanceLoading, setReportAttendanceLoading] = useState(false);
  const [reportExportLoading, setReportExportLoading] = useState(false);
  const [reportAttendanceError, setReportAttendanceError] = useState("");
  const [reportHasMore, setReportHasMore] = useState(false);
  const [reportFrom, setReportFrom] = useState(today);
  const [reportTo, setReportTo] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(
    firstDayOfMonth(new Date(`${today}T00:00:00`)),
  );
  const [dailyAttendanceLoading, setDailyAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [dailyAttendanceError, setDailyAttendanceError] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const location = useLocation();
  const navigate = useNavigate();
  const authCheckId = useRef(0);
  const orgCatalogRequestId = useRef(0);
  const orgCatalogLoadedFor = useRef("");
  const employeeRequestId = useRef(0);
  const staffAccountsRequestId = useRef(0);
  const attendanceRequestId = useRef(0);
  const reportAttendanceRequestId = useRef(0);
  const reportAttendanceCursor = useRef(null);
  const dailyAttendanceRequestId = useRef(0);
  const isSuperAdmin =
    SUPER_ADMIN_UIDS.includes(currentUser?.id) &&
    currentUser?.role === "SuperAdmin";
  const isAdmin =
    currentUser?.role === "Admin" || currentUser?.role === "SuperAdmin";
  const scopedGodown = isAdmin ? activeGodown : currentUser?.godown;
  const godownEntries = catalogEntries(orgCatalogs.godowns);
  const jobRoleEntries = catalogEntries(orgCatalogs.jobRoles);
  const departmentEntries = catalogEntries(orgCatalogs.departments);
  const activeScopeLabel =
    isAdmin && activeDepartmentId !== "All departments"
      ? orgCatalogs.departments[activeDepartmentId]?.name || "All departments"
      : scopedGodown;
  const currentUserGodownName =
    catalogEntries(orgCatalogs.godowns, { includeArchived: true }).find(
      (entry) => entry.id === currentUser?.godownId,
    )?.name || currentUser?.godown;
  const attendanceScopeKey = currentUser
    ? `${currentUser.id}|${currentUser.role}|${scopedGodown}|${currentUser.godownId || ""}`
    : "";
  const dailyAttendanceKey = attendanceScopeKey
    ? `${attendanceScopeKey}|${selectedDate}`
    : "";
  const calendarQueryKey = attendanceScopeKey
    ? `${attendanceScopeKey}|${formatLocalDate(calendarMonth)}`
    : "";
  const reportQueryKey = attendanceScopeKey
    ? `${attendanceScopeKey}|${reportFrom}|${reportTo}`
    : "";
  const visibleCalendarAttendance =
    attendanceScopeKey && calendarDataScopeKey === attendanceScopeKey
      ? attendance
      : [];
  const visibleReportAttendance =
    attendanceScopeKey && reportDataScopeKey === attendanceScopeKey
      ? reportAttendance
      : [];
  const visibleDailyAttendance =
    dailyAttendanceKey && dailyDataKey === dailyAttendanceKey
      ? dailyAttendance
      : [];
  const visibleCalendarError =
    calendarErrorQueryKey === calendarQueryKey ? attendanceError : "";
  const visibleReportError =
    reportErrorQueryKey === reportQueryKey ? reportAttendanceError : "";
  const visibleReportDataQueryKey =
    reportDataScopeKey === attendanceScopeKey ? reportDataQueryKey : "";
  const [loadedReportFrom, loadedReportTo] = visibleReportDataQueryKey
    ? visibleReportDataQueryKey.split("|").slice(-2)
    : [];
  const reportResultsAreStale =
    Boolean(visibleReportDataQueryKey) &&
    visibleReportDataQueryKey !== reportQueryKey;
  const calendarRefreshPending =
    attendanceLoading ||
    (location.pathname === "/calendar" &&
      Boolean(currentUser) &&
      calendarDataQueryKey !== calendarQueryKey &&
      !visibleCalendarError);
  const reportRefreshPending =
    reportAttendanceLoading ||
    (location.pathname === "/reports" &&
      Boolean(currentUser) &&
      isAdmin &&
      reportDataQueryKey !== reportQueryKey &&
      !visibleReportError);
  const dailyRefreshPending =
    dailyAttendanceLoading ||
    (Boolean(currentUser) &&
      dailyDataKey !== dailyAttendanceKey &&
      !dailyAttendanceError);

  const loadOrgCatalogs = useCallback(
    async ({ force = false } = {}) => {
      if (!currentUser) return false;
      if (!force && orgCatalogLoadedFor.current === currentUser.id) return true;
      const requestId = ++orgCatalogRequestId.current;
      setOrgCatalogLoading(true);
      setOrgCatalogError("");
      try {
        const catalogRef = doc(db, "settings", "catalogs");
        const snapshot = force
          ? await getDocFromServer(catalogRef)
          : await getDoc(catalogRef);
        if (requestId !== orgCatalogRequestId.current) return false;
        const nextCatalogs = snapshot.exists()
          ? normalizeOrgCatalogs(snapshot.data())
          : seededOrgCatalogs;
        setOrgCatalogs(nextCatalogs);
        setOrgCatalogStored(snapshot.exists());
        orgCatalogLoadedFor.current = currentUser.id;
        return true;
      } catch (error) {
        if (requestId === orgCatalogRequestId.current) {
          setOrgCatalogError(
            error.code === "permission-denied"
              ? "Firestore denied access to organizational settings."
              : "Could not load organizational settings. Check your connection and retry.",
          );
        }
        console.error("Could not load organizational settings.", error);
        return false;
      } finally {
        if (requestId === orgCatalogRequestId.current) {
          setOrgCatalogLoading(false);
        }
      }
    },
    [currentUser?.id],
  );

  useEffect(() => {
    if (!currentUser) {
      ++orgCatalogRequestId.current;
      orgCatalogLoadedFor.current = "";
      setOrgCatalogs(seededOrgCatalogs);
      setOrgCatalogStored(false);
      setOrgCatalogError("");
      setOrgCatalogLoading(false);
      return undefined;
    }
    void loadOrgCatalogs();
    return () => {
      ++orgCatalogRequestId.current;
    };
  }, [currentUser?.id, loadOrgCatalogs]);

  useEffect(() => {
    if (!isAdmin || activeGodown === "All godowns") return;
    const entry = findCatalogEntryByName(orgCatalogs.godowns, activeGodown);
    if (!entry?.active) {
      setActiveGodown("All godowns");
    } else if (activeGodown !== entry.name) {
      setActiveGodown(entry.name);
    }
  }, [activeGodown, isAdmin, orgCatalogs.godowns]);

  useEffect(() => {
    if (
      activeDepartmentId !== "All departments" &&
      orgCatalogs.departments[activeDepartmentId]?.active !== true
    ) {
      setActiveDepartmentId("All departments");
    }
  }, [activeDepartmentId, orgCatalogs.departments]);

  const saveOrgCatalogs = async (nextCatalogs) => {
    if (!isSuperAdmin) {
      throw new Error("Only the protected SuperAdmin can manage settings.");
    }
    const catalogRef = doc(db, "settings", "catalogs");
    try {
      const savedCatalogs = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(catalogRef);
        const latest = snapshot.exists()
          ? normalizeOrgCatalogs(snapshot.data())
          : seededOrgCatalogs;
        const catalogsToSave = mergeCatalogChanges(
          orgCatalogs,
          latest,
          nextCatalogs,
        );
        transaction.set(catalogRef, catalogsToSave);
        return catalogsToSave;
      });
      setOrgCatalogs(savedCatalogs);
      setOrgCatalogStored(true);
      orgCatalogLoadedFor.current = currentUser.id;
      setOrgCatalogError("");
    } catch (error) {
      console.error("Could not save organizational settings.", error);
      throw new Error(
        error.code === "permission-denied"
          ? "Firestore denied this settings change. Verify the deployed SuperAdmin rules."
          : "Could not save settings. Refresh the catalogue and try again.",
      );
    }
  };

  const loadEmployees = useCallback(async () => {
    const requestId = ++employeeRequestId.current;
    if (!currentUser) {
      setEmployees([]);
      setEmployeesError("");
      setEmployeesLoading(false);
      return true;
    }

    setEmployeesLoading(true);
    setEmployeesError("");
    try {
      const employeesCollection = collection(db, "employees");
      const snapshots =
        currentUser.role !== "Staff"
          ? [await getDocs(employeesCollection)]
          : await Promise.all([
              getDocs(
                query(
                  employeesCollection,
                  where("godown", "==", currentUser.godown),
                ),
              ),
              ...(currentUser.godownId
                ? [
                    getDocs(
                      query(
                        employeesCollection,
                        where("godownId", "==", currentUser.godownId),
                      ),
                    ),
                  ]
                : []),
            ]);
      if (requestId !== employeeRequestId.current) return false;

      const employeeDocs = new Map(
        snapshots.flatMap((snapshot) =>
          snapshot.docs.map((employeeDoc) => [employeeDoc.id, employeeDoc]),
        ),
      );
      setEmployees(
        [...employeeDocs.values()].map((employeeDoc) => ({
          id: employeeDoc.id,
          ...employeeDoc.data(),
        })),
      );
      setEmployeesLoading(false);
      return true;
    } catch (error) {
      if (requestId === employeeRequestId.current) {
        setEmployees([]);
        setEmployeesError(
          error.code === "permission-denied"
            ? "You do not have permission to load these employee records."
            : "Could not load employee records. Check your connection and try again.",
        );
        setEmployeesLoading(false);
      }
      console.error("Could not load employee records from Firestore.", error);
      return false;
    }
  }, [currentUser]);

  const loadCalendarAttendance = useCallback(async () => {
    const requestId = ++attendanceRequestId.current;
    if (!currentUser) {
      setAttendance([]);
      setCalendarDataScopeKey("");
      setCalendarDataQueryKey("");
      setAttendanceError("");
      setCalendarErrorQueryKey("");
      setAttendanceLoading(false);
      return true;
    }
    if (location.pathname !== "/calendar") {
      setAttendanceLoading(false);
      return true;
    }

    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      const monthStart = formatLocalDate(calendarMonth);
      const monthEnd = formatLocalDate(
        new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0),
      );
      const constraints = [
        where("date", ">=", monthStart),
        where("date", "<=", monthEnd),
        orderBy("date", "asc"),
      ];
      const attendanceCollection = collection(db, "attendance");
      const attendanceQueries =
        isAdmin && scopedGodown !== "All godowns"
          ? [
              query(
                attendanceCollection,
                ...constraints,
                ...(getGodownNames(orgCatalogs, scopedGodown).length > 1
                  ? [
                      where(
                        "godown",
                        "in",
                        getGodownNames(orgCatalogs, scopedGodown),
                      ),
                    ]
                  : [
                      where(
                        "godown",
                        "==",
                        getGodownNames(orgCatalogs, scopedGodown)[0] ||
                          scopedGodown,
                      ),
                    ]),
              ),
            ]
          : isAdmin
            ? [query(attendanceCollection, ...constraints)]
            : [
                query(
                  attendanceCollection,
                  ...constraints,
                  where("godown", "==", currentUser.godown),
                ),
                ...(currentUser.godownId
                  ? [
                      query(
                        attendanceCollection,
                        ...constraints,
                        where("godownId", "==", currentUser.godownId),
                      ),
                    ]
                  : []),
              ];
      const snapshots = await Promise.all(
        attendanceQueries.map((attendanceQuery) => getDocs(attendanceQuery)),
      );
      if (requestId !== attendanceRequestId.current) return false;

      const attendanceDocs = new Map(
        snapshots.flatMap((snapshot) =>
          snapshot.docs.map((attendanceDoc) => [
            attendanceDoc.id,
            attendanceDoc,
          ]),
        ),
      );
      setAttendance(
        [...attendanceDocs.values()]
          .sort((left, right) =>
            String(left.data().date).localeCompare(String(right.data().date)),
          )
          .map((attendanceDoc) => ({
            id: attendanceDoc.id,
            ...attendanceDoc.data(),
          })),
      );
      setCalendarDataScopeKey(attendanceScopeKey);
      setCalendarDataQueryKey(calendarQueryKey);
      return true;
    } catch (error) {
      if (requestId === attendanceRequestId.current) {
        setAttendanceError(attendanceLoadErrorMessage(error));
        setCalendarErrorQueryKey(calendarQueryKey);
      }
      console.error("Could not load attendance history from Firestore.", error);
      return false;
    } finally {
      if (requestId === attendanceRequestId.current) {
        setAttendanceLoading(false);
      }
    }
  }, [
    attendanceScopeKey,
    calendarQueryKey,
    currentUser,
    isAdmin,
    scopedGodown,
    orgCatalogs,
    location.pathname,
    calendarMonth,
  ]);

  const loadReportAttendance = useCallback(
    async (append = false) => {
      const requestId = ++reportAttendanceRequestId.current;
      if (!currentUser || !isAdmin) {
        setReportAttendance([]);
        setReportDataScopeKey("");
        setReportDataQueryKey("");
        setReportAttendanceError("");
        setReportErrorQueryKey("");
        setReportAttendanceLoading(false);
        setReportHasMore(false);
        reportAttendanceCursor.current = null;
        return true;
      }
      if (location.pathname !== "/reports") {
        setReportAttendanceLoading(false);
        return true;
      }
      if (
        !isAttendanceDate(reportFrom) ||
        !isAttendanceDate(reportTo) ||
        reportFrom > reportTo
      ) {
        setReportAttendance([]);
        setReportAttendanceError("Choose a valid report date range.");
        setReportErrorQueryKey(reportQueryKey);
        setReportAttendanceLoading(false);
        setReportHasMore(false);
        reportAttendanceCursor.current = null;
        setReportDataScopeKey("");
        setReportDataQueryKey("");
        return false;
      }

      setReportAttendanceLoading(true);
      setReportAttendanceError("");
      if (!append) {
        setReportHasMore(false);
      }

      try {
        const snapshot = await getDocs(
          createReportAttendanceQuery(
            reportFrom,
            reportTo,
            scopedGodown,
            getGodownNames(orgCatalogs, scopedGodown),
            append ? reportAttendanceCursor.current : null,
          ),
        );
        if (requestId !== reportAttendanceRequestId.current) return false;

        const page = snapshot.docs.map((attendanceDoc) => ({
          id: attendanceDoc.id,
          ...attendanceDoc.data(),
        }));
        reportAttendanceCursor.current =
          snapshot.docs[snapshot.docs.length - 1] || null;
        setReportAttendance((previous) =>
          append ? [...previous, ...page] : page,
        );
        setReportDataScopeKey(attendanceScopeKey);
        setReportDataQueryKey(reportQueryKey);
        setReportHasMore(snapshot.docs.length === attendancePageSize);
        return true;
      } catch (error) {
        if (requestId === reportAttendanceRequestId.current) {
          setReportAttendanceError(attendanceLoadErrorMessage(error));
          setReportErrorQueryKey(reportQueryKey);
        }
        console.error(
          "Could not load attendance report from Firestore.",
          error,
        );
        return false;
      } finally {
        if (requestId === reportAttendanceRequestId.current) {
          setReportAttendanceLoading(false);
        }
      }
    },
    [
      currentUser,
      isAdmin,
      attendanceScopeKey,
      reportQueryKey,
      location.pathname,
      reportFrom,
      reportTo,
      scopedGodown,
      orgCatalogs,
    ],
  );

  const downloadAttendanceReport = async () => {
    if (!currentUser || !isAdmin || reportExportLoading) return;
    if (
      !isAttendanceDate(reportFrom) ||
      !isAttendanceDate(reportTo) ||
      reportFrom > reportTo
    ) {
      showToast(
        "Choose a valid report date range before downloading.",
        "error",
      );
      return;
    }

    setReportExportLoading(true);
    try {
      const records = [];
      let cursor = null;
      while (true) {
        const snapshot = await getDocs(
          createReportAttendanceQuery(
            reportFrom,
            reportTo,
            scopedGodown,
            getGodownNames(orgCatalogs, scopedGodown),
            cursor,
          ),
        );
        records.push(
          ...snapshot.docs.map((attendanceDoc) => ({
            id: attendanceDoc.id,
            ...attendanceDoc.data(),
          })),
        );
        if (snapshot.docs.length < attendancePageSize) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
      }

      const validRecords = records
        .filter(
          (record) =>
            statuses.includes(record.status) &&
            (activeDepartmentId === "All departments" ||
              (record.departmentId
                ? record.departmentId === activeDepartmentId
                : departmentEmployeeIds.has(String(record.employeeId)))),
        )
        .sort(
          (left, right) =>
            left.date.localeCompare(right.date) ||
            String(left.godown || "").localeCompare(
              String(right.godown || ""),
            ) ||
            (left.employeeName || "").localeCompare(right.employeeName || ""),
        );
      const buffer = await runReportWorkbookWorker({
        type: "report",
        from: reportFrom,
        to: reportTo,
        godown:
          activeDepartmentId !== "All departments"
            ? `Department: ${orgCatalogs.departments[activeDepartmentId]?.name || activeDepartmentId}`
            : scopedGodown === "All godowns"
              ? "All Godowns"
              : scopedGodown,
        records: validRecords,
        statuses,
      });
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `peoplehub-attendance-${reportFrom}-to-${reportTo}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Attendance report downloaded.");
    } catch (error) {
      console.error("Could not download the attendance report.", error);
      showToast(
        error?.code
          ? attendanceLoadErrorMessage(error)
          : error.message || "Could not create the attendance report workbook.",
        "error",
      );
    } finally {
      setReportExportLoading(false);
    }
  };

  const loadDailyAttendance = useCallback(async () => {
    const requestId = ++dailyAttendanceRequestId.current;
    if (!currentUser) {
      setDailyAttendance([]);
      setDailyDataKey("");
      setDailyAttendanceError("");
      setDailyAttendanceLoading(false);
      return true;
    }
    if (!isAttendanceDate(selectedDate)) {
      setDailyAttendance([]);
      setDailyDataKey("");
      setDailyAttendanceError("Choose a valid date to load attendance.");
      setDailyAttendanceLoading(false);
      return false;
    }

    setDailyAttendanceLoading(true);
    setDailyAttendanceError("");
    try {
      const attendanceCollection = collection(db, "attendance");
      const constraints = [where("date", "==", selectedDate)];
      const attendanceQueries =
        isAdmin && scopedGodown !== "All godowns"
          ? [
              query(
                attendanceCollection,
                ...constraints,
                ...(getGodownNames(orgCatalogs, scopedGodown).length > 1
                  ? [
                      where(
                        "godown",
                        "in",
                        getGodownNames(orgCatalogs, scopedGodown),
                      ),
                    ]
                  : [
                      where(
                        "godown",
                        "==",
                        getGodownNames(orgCatalogs, scopedGodown)[0] ||
                          scopedGodown,
                      ),
                    ]),
              ),
            ]
          : isAdmin
            ? [query(attendanceCollection, ...constraints)]
            : [
                query(
                  attendanceCollection,
                  ...constraints,
                  where("godown", "==", currentUser.godown),
                ),
                ...(currentUser.godownId
                  ? [
                      query(
                        attendanceCollection,
                        ...constraints,
                        where("godownId", "==", currentUser.godownId),
                      ),
                    ]
                  : []),
              ];
      const snapshots = await Promise.all(
        attendanceQueries.map((attendanceQuery) => getDocs(attendanceQuery)),
      );
      if (requestId !== dailyAttendanceRequestId.current) return false;

      const attendanceDocs = new Map(
        snapshots.flatMap((snapshot) =>
          snapshot.docs.map((attendanceDoc) => [
            attendanceDoc.id,
            attendanceDoc,
          ]),
        ),
      );
      setDailyAttendance(
        [...attendanceDocs.values()].map((attendanceDoc) => ({
          id: attendanceDoc.id,
          ...attendanceDoc.data(),
        })),
      );
      setDailyDataKey(dailyAttendanceKey);
      return true;
    } catch (error) {
      if (requestId === dailyAttendanceRequestId.current) {
        setDailyAttendanceError(attendanceLoadErrorMessage(error));
      }
      console.error(
        "Could not load selected-date attendance from Firestore.",
        error,
      );
      return false;
    } finally {
      if (requestId === dailyAttendanceRequestId.current) {
        setDailyAttendanceLoading(false);
      }
    }
  }, [
    currentUser,
    isAdmin,
    orgCatalogs,
    scopedGodown,
    selectedDate,
    dailyAttendanceKey,
  ]);

  useEffect(() => {
    void loadCalendarAttendance();
    return () => {
      ++attendanceRequestId.current;
    };
  }, [loadCalendarAttendance]);

  useEffect(() => {
    void loadReportAttendance();
    return () => {
      ++reportAttendanceRequestId.current;
    };
  }, [loadReportAttendance]);

  useEffect(() => {
    setCalendarMonth(firstDayOfMonth(new Date(`${selectedDate}T00:00:00`)));
  }, [selectedDate]);

  useEffect(() => {
    void loadDailyAttendance();
    return () => {
      ++dailyAttendanceRequestId.current;
    };
  }, [loadDailyAttendance]);

  const loadStaffAccounts = useCallback(async () => {
    const requestId = ++staffAccountsRequestId.current;
    if (!isSuperAdmin) {
      setUserAccounts([]);
      setStaffAccountsError("");
      setStaffAccountsLoading(false);
      return false;
    }

    setStaffAccountsLoading(true);
    setStaffAccountsError("");
    try {
      const snapshot = await getDocsFromServer(collection(db, "users"));
      if (requestId !== staffAccountsRequestId.current) return false;

      setUserAccounts(
        snapshot.docs
          .map((accountDoc) => {
            const profile = accountDoc.data();
            const email =
              typeof profile.email === "string" ? profile.email : "";
            return {
              id: accountDoc.id,
              email,
              name:
                (typeof profile.name === "string" && profile.name.trim()) ||
                email ||
                "Staff account",
              role:
                SUPER_ADMIN_UIDS.includes(accountDoc.id) &&
                profile.role === "SuperAdmin"
                  ? "SuperAdmin"
                  : profile.role,
              godown: profile.godown,
              godownId: profile.godownId || null,
              active: profile.active === true,
            };
          })
          .filter(
            (account) =>
              account.role === "Staff" ||
              account.role === "Admin" ||
              SUPER_ADMIN_UIDS.includes(account.id),
          ),
      );
      return true;
    } catch (error) {
      if (requestId === staffAccountsRequestId.current) {
        setUserAccounts([]);
        setStaffAccountsError(
          error.code === "permission-denied"
            ? "Firestore denied access to user profiles. Verify the Admin access rules."
            : "Could not load user profiles. Check your connection and try again.",
        );
      }
      console.error("Could not load staff profiles from Firestore.", error);
      return false;
    } finally {
      if (requestId === staffAccountsRequestId.current) {
        setStaffAccountsLoading(false);
      }
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      ++staffAccountsRequestId.current;
      setUserAccounts([]);
      setStaffAccountsError("");
      setStaffAccountsLoading(false);
      return undefined;
    }

    void loadStaffAccounts();
    return () => {
      ++staffAccountsRequestId.current;
    };
  }, [isSuperAdmin, loadStaffAccounts]);

  useEffect(() => {
    if (!currentUser) {
      ++employeeRequestId.current;
      setEmployees([]);
      setEmployeesError("");
      setEmployeesLoading(false);
      return undefined;
    }

    void loadEmployees();
    return () => {
      ++employeeRequestId.current;
    };
  }, [currentUser, loadEmployees]);

  useEffect(() => {
    if (!currentUser) return undefined;

    return onSnapshot(
      doc(db, "users", currentUser.id),
      (profileSnapshot) => {
        const profile = profileSnapshot.data();
        const isProtectedSuperAdmin =
          SUPER_ADMIN_UIDS.includes(currentUser.id) &&
          profile?.role === "SuperAdmin" &&
          profile?.active === true;
        const role = isProtectedSuperAdmin ? "SuperAdmin" : profile?.role;
        const validRole =
          isProtectedSuperAdmin ||
          profile?.role === "Admin" ||
          profile?.role === "Staff";
        const validGodown =
          role !== "Staff" ||
          (typeof profile?.godown === "string" &&
            (typeof profile?.godownId === "string" ||
              Boolean(
                findCatalogEntryByName(orgCatalogs.godowns, profile.godown),
              )));

        if (
          !profileSnapshot.exists() ||
          profile?.active !== true ||
          !validRole ||
          !validGodown
        ) {
          setCurrentUser(null);
          setUserAccounts([]);
          void firebaseSignOut(auth).catch((error) => {
            console.error(
              "Could not end access after a profile change.",
              error,
            );
          });
          navigate("/login", { replace: true });
          return;
        }

        setCurrentUser((previous) =>
          previous?.id === currentUser.id
            ? {
                ...previous,
                role,
                godown: role === "Staff" ? profile.godown : null,
                godownId: role === "Staff" ? profile.godownId || null : null,
              }
            : previous,
        );
        setActiveGodown(role === "Staff" ? profile.godown : "All godowns");
      },
      (error) => {
        console.error(
          "Could not subscribe to the signed-in user profile.",
          error,
        );
      },
    );
  }, [currentUser?.id, navigate]);

  useEffect(() => {
    let isMounted = true;
    const isCurrentCheck = (checkId, uid) =>
      isMounted &&
      authCheckId.current === checkId &&
      (!uid || auth.currentUser?.uid === uid);
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!isMounted) return;
        const checkId = ++authCheckId.current;
        setAuthLoading(true);
        setCurrentUser(null);

        if (!firebaseUser) {
          setActiveGodown("All godowns");
          setEmployeesLoading(false);
          setAuthLoading(false);
          return;
        }

        try {
          const profileSnapshot = await getDoc(
            doc(db, "users", firebaseUser.uid),
          );
          if (!isCurrentCheck(checkId, firebaseUser.uid)) return;

          if (!profileSnapshot.exists()) {
            setAuthError(
              "Your account profile was not found. Contact an administrator.",
            );
            setActiveGodown("All godowns");
            setEmployeesLoading(false);
            try {
              await firebaseSignOut(auth);
            } catch (error) {
              if (isCurrentCheck(checkId, firebaseUser.uid)) {
                console.error(
                  "Could not sign out an account without a profile.",
                  error,
                );
                setAuthLoading(false);
              }
            }
            return;
          }

          const profile = profileSnapshot.data();
          const isProtectedSuperAdmin =
            SUPER_ADMIN_UIDS.includes(firebaseUser.uid) &&
            profile.role === "SuperAdmin" &&
            profile.active === true;
          const role = isProtectedSuperAdmin ? "SuperAdmin" : profile.role;
          const validRole =
            isProtectedSuperAdmin ||
            profile.role === "Admin" ||
            profile.role === "Staff";
          const validGodown =
            role !== "Staff" ||
            (typeof profile.godown === "string" &&
              (typeof profile.godownId === "string" ||
                Boolean(
                  findCatalogEntryByName(
                    seededOrgCatalogs.godowns,
                    profile.godown,
                  ),
                )));
          if (profile.active !== true || !validRole || !validGodown) {
            setAuthError(
              "Your account is inactive or its access profile is invalid. Contact an administrator.",
            );
            setActiveGodown("All godowns");
            setEmployeesLoading(false);
            try {
              await firebaseSignOut(auth);
            } catch (error) {
              if (isCurrentCheck(checkId, firebaseUser.uid)) {
                console.error(
                  "Could not sign out an inactive or invalid account.",
                  error,
                );
                setAuthLoading(false);
              }
            }
            return;
          }

          setEmployeesLoading(true);
          setCurrentUser({
            id: firebaseUser.uid,
            name:
              (typeof profile.name === "string" && profile.name.trim()) ||
              firebaseUser.displayName ||
              firebaseUser.email ||
              "User",
            email: firebaseUser.email || "",
            role,
            godown:
              role === "Admin" || role === "SuperAdmin" ? null : profile.godown,
            godownId:
              role === "Admin" || role === "SuperAdmin"
                ? null
                : profile.godownId || null,
          });
          setActiveGodown(
            role === "Admin" || role === "SuperAdmin"
              ? "All godowns"
              : profile.godown,
          );
          if (isCurrentCheck(checkId, firebaseUser.uid)) {
            setAuthError("");
            setAuthLoading(false);
          }
        } catch (error) {
          if (isCurrentCheck(checkId, firebaseUser.uid)) {
            setAuthError(
              "Unable to load your account profile. Please try again.",
            );
            setActiveGodown("All godowns");
            setEmployeesLoading(false);
            try {
              await firebaseSignOut(auth);
            } catch (signOutError) {
              if (isCurrentCheck(checkId, firebaseUser.uid)) {
                console.error(
                  "Could not sign out after profile loading failed.",
                  signOutError,
                );
                setAuthError(
                  "Unable to verify your account or end its session. Please try again.",
                );
                setAuthLoading(false);
              }
            }
            if (isCurrentCheck(checkId, firebaseUser.uid)) {
              setAuthLoading(false);
            }
          }
          console.error("Could not load the signed-in user's profile.", error);
        }
      },
      (error) => {
        ++authCheckId.current;
        if (isMounted) {
          setCurrentUser(null);
          setEmployeesLoading(false);
          setAuthError(
            "Unable to check your sign-in session. Please try again.",
          );
          setAuthLoading(false);
        }
        console.error("Firebase Authentication session check failed.", error);
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    setAuthError("");
    await signInWithEmailAndPassword(auth, email.trim(), password);
    navigate("/", { replace: true });
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setModal(null);
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Firebase Authentication sign-out failed.", error);
      showToast("Unable to sign out. Please try again.");
    }
  };

  const createStaffAccount = async (details) => {
    if (!isSuperAdmin) {
      throw new Error("Only the SuperAdmin can create an account.");
    }
    const email = details.email.trim();
    const role = details.role;
    const godownEntry =
      role === "Staff"
        ? godownEntries.find((entry) => entry.id === details.godownId)
        : null;
    const godown = role === "Admin" ? null : godownEntry?.name;
    if (
      !["Staff", "Admin"].includes(role) ||
      (role === "Staff" && !godownEntry) ||
      (role === "Admin" && details.godown !== null)
    ) {
      throw new Error(
        "Choose Staff with one configured godown or Admin with no godown.",
      );
    }
    if (
      userAccounts.some(
        (account) => account.email.toLowerCase() === email.toLowerCase(),
      )
    ) {
      throw new Error("An account with this email already exists.");
    }

    const credential = await createUserWithEmailAndPassword(
      staffAccountAuth,
      email,
      details.password,
    );
    try {
      await setDoc(doc(db, "users", credential.user.uid), {
        role,
        active: true,
        godown,
        ...(role === "Staff" && orgCatalogStored
          ? { godownId: godownEntry.id }
          : {}),
        email,
        createdAt: serverTimestamp(),
      });
    } catch (profileError) {
      let cleanupError;
      try {
        await deleteUser(credential.user);
      } catch (error) {
        cleanupError = error;
        console.error(
          "Could not remove the Authentication account after profile creation failed.",
          error,
        );
      }

      if (cleanupError) {
        throw new Error(
          `The Authentication account was created, but its Firestore profile could not be saved and the account could not be removed (UID: ${credential.user.uid}). Check Firestore rules and remove the orphaned account manually.`,
        );
      }
      throw new Error(
        `The Firestore profile could not be saved. The newly created Authentication account was removed. ${firestoreErrorMessage(profileError)}`,
      );
    }

    try {
      await firebaseSignOut(staffAccountAuth);
    } catch (error) {
      console.error(
        "Could not clear the secondary Authentication session.",
        error,
      );
    }

    const refreshed = await loadStaffAccounts();
    showToast(
      refreshed
        ? `${role} account created`
        : `${role} account created, but the account list could not be refreshed.`,
    );
    navigate("/users");
  };

  const updateStaffAccount = async (accountId, changes) => {
    if (!isSuperAdmin || SUPER_ADMIN_UIDS.includes(accountId)) return false;
    const account = userAccounts.find((item) => item.id === accountId);
    if (!account) {
      setStaffAccountsError(
        "This account is no longer available. Reload the list and try again.",
      );
      return false;
    }

    const role = Object.hasOwn(changes, "role") ? changes.role : account.role;
    const godownId = Object.hasOwn(changes, "godownId")
      ? changes.godownId
      : account.godownId;
    const godownEntry =
      role === "Staff"
        ? catalogEntries(orgCatalogs.godowns, { includeArchived: true }).find(
            (entry) => entry.id === godownId,
          )
        : null;
    const changingGodown = godownId !== account.godownId;
    const changingAssignment =
      Object.hasOwn(changes, "godownId") ||
      (Object.hasOwn(changes, "role") && role !== account.role);
    const godown =
      role === "Admin"
        ? null
        : godownId === account.godownId
          ? account.godown
          : godownEntry?.name;
    if (
      !["Staff", "Admin"].includes(role) ||
      (role === "Staff" &&
        changingAssignment &&
        (!godownEntry || (changingGodown && !godownEntry.active))) ||
      (role === "Admin" && godown !== null) ||
      (Object.hasOwn(changes, "active") && typeof changes.active !== "boolean")
    ) {
      setStaffAccountsError("Choose a valid account role, godown, or status.");
      return false;
    }

    if (accountId === currentUser.id) {
      setStaffAccountsError("You cannot manage your own account.");
      return false;
    }

    const removesActiveAdmin =
      account.role === "Admin" &&
      account.active &&
      (role !== "Admin" || changes.active === false);
    if (removesActiveAdmin) {
      try {
        const latestAccounts = await getDocsFromServer(collection(db, "users"));
        const activeAdminCount = latestAccounts.docs.filter((accountDoc) => {
          const profile = accountDoc.data();
          return profile.role === "Admin" && profile.active === true;
        }).length;
        if (activeAdminCount <= 1) {
          setStaffAccountsError(
            "The last active Admin cannot be demoted or deactivated.",
          );
          return false;
        }
      } catch (error) {
        setStaffAccountsError(
          "Could not verify the active Admin count. Try again before changing this account.",
        );
        console.error("Could not verify active Admin accounts.", error);
        return false;
      }
    }

    setUpdatingStaffAccountId(accountId);
    setStaffAccountsError("");
    try {
      const profileChanges = {
        ...changes,
        ...(Object.hasOwn(changes, "role") || Object.hasOwn(changes, "godownId")
          ? {
              role,
              godown,
              godownId:
                role === "Staff" && orgCatalogStored
                  ? godownEntry.id
                  : deleteField(),
            }
          : {}),
      };
      await updateDoc(doc(db, "users", accountId), profileChanges);
      setUserAccounts((previous) =>
        previous.map((account) =>
          account.id === accountId
            ? {
                ...account,
                ...profileChanges,
                godownId:
                  role === "Staff" && orgCatalogStored
                    ? godownEntry?.id || null
                    : null,
              }
            : account,
        ),
      );
      showToast("Account updated");
      return true;
    } catch (error) {
      setStaffAccountsError(
        error.code === "permission-denied"
          ? "Firestore denied this account change. Verify the Admin access rules."
          : "Could not update this account. Please try again.",
      );
      console.error("Could not update a user profile in Firestore.", error);
      return false;
    } finally {
      setUpdatingStaffAccountId("");
    }
  };

  const scopedEmployees = useMemo(() => {
    if (scopedGodown === "All godowns") return employees;
    const selectedEntry = findCatalogEntryByName(
      orgCatalogs.godowns,
      scopedGodown,
    );
    if (!selectedEntry) {
      return employees.filter((employee) => employee.godown === scopedGodown);
    }
    const acceptedNames = [
      selectedEntry.name,
      ...(selectedEntry.legacyAliases || []),
    ];
    return employees.filter(
      (employee) =>
        employee.godownId === selectedEntry.id ||
        acceptedNames.includes(employee.godown),
    );
  }, [employees, scopedGodown, orgCatalogs.godowns]);
  const departmentScopedEmployees = useMemo(() => {
    const department = orgCatalogs.departments[activeDepartmentId];
    const filteredEmployees =
      activeDepartmentId === "All departments"
        ? scopedEmployees
        : !department
          ? []
          : employees.filter((employee) => {
              const acceptedNames = [
                department.name,
                ...(department.legacyAliases || []),
              ];
              return (
                employee.departmentId === activeDepartmentId ||
                acceptedNames.includes(employee.department)
              );
            });
    return filteredEmployees.map((employee) => ({
      ...employee,
      displayRole:
        catalogEntries(orgCatalogs.jobRoles, { includeArchived: true }).find(
          (entry) =>
            entry.id === employee.jobRoleId ||
            entry.name === employee.role ||
            (entry.legacyAliases || []).includes(employee.role),
        )?.name || employee.role,
      displayGodown:
        catalogEntries(orgCatalogs.godowns, { includeArchived: true }).find(
          (entry) =>
            entry.id === employee.godownId ||
            entry.name === employee.godown ||
            (entry.legacyAliases || []).includes(employee.godown),
        )?.name || employee.godown,
      displayDepartment:
        catalogEntries(orgCatalogs.departments, {
          includeArchived: true,
        }).find(
          (entry) =>
            entry.id === employee.departmentId ||
            entry.name === employee.department ||
            (entry.legacyAliases || []).includes(employee.department),
        )?.name ||
        employee.department ||
        "",
      displayAssignment: employee.departmentId
        ? `Department: ${
            catalogEntries(orgCatalogs.departments, {
              includeArchived: true,
            }).find((entry) => entry.id === employee.departmentId)?.name ||
            employee.department
          }`
        : `Godown: ${
            catalogEntries(orgCatalogs.godowns, {
              includeArchived: true,
            }).find((entry) => entry.id === employee.godownId)?.name ||
            employee.godown
          }`,
    }));
  }, [
    activeDepartmentId,
    employees,
    orgCatalogs.departments,
    orgCatalogs.jobRoles,
    orgCatalogs.godowns,
    scopedEmployees,
  ]);
  const departmentEmployeeIds = useMemo(
    () =>
      new Set(departmentScopedEmployees.map((employee) => String(employee.id))),
    [departmentScopedEmployees],
  );
  const departmentScopedDailyAttendance = useMemo(() => {
    if (activeDepartmentId === "All departments") return visibleDailyAttendance;
    return visibleDailyAttendance.filter((record) =>
      record.departmentId
        ? record.departmentId === activeDepartmentId
        : departmentEmployeeIds.has(String(record.employeeId)),
    );
  }, [activeDepartmentId, departmentEmployeeIds, visibleDailyAttendance]);
  const departmentScopedCalendarAttendance = useMemo(() => {
    if (activeDepartmentId === "All departments") {
      return visibleCalendarAttendance;
    }
    return visibleCalendarAttendance.filter((record) =>
      record.departmentId
        ? record.departmentId === activeDepartmentId
        : departmentEmployeeIds.has(String(record.employeeId)),
    );
  }, [activeDepartmentId, departmentEmployeeIds, visibleCalendarAttendance]);
  const visibleEmployees = useMemo(
    () =>
      departmentScopedEmployees.filter((employee) =>
        `${employee.name} ${employee.role} ${employee.displayRole}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [departmentScopedEmployees, search],
  );
  const departmentScopedReportAttendance = useMemo(() => {
    if (activeDepartmentId === "All departments")
      return visibleReportAttendance;
    const employeeIds = new Set(
      departmentScopedEmployees.map((employee) => String(employee.id)),
    );
    return visibleReportAttendance.filter((record) =>
      record.departmentId
        ? record.departmentId === activeDepartmentId
        : employeeIds.has(String(record.employeeId)),
    );
  }, [activeDepartmentId, departmentScopedEmployees, visibleReportAttendance]);

  const attendanceRows = useMemo(
    () =>
      visibleEmployees
        .filter((employee) => employee.status === "Active")
        .map((employee) => {
          const attendanceRecord = visibleDailyAttendance.find(
            (record) =>
              String(record.employeeId) === String(employee.id) &&
              record.date === selectedDate,
          );
          return {
            ...employee,
            attendance: attendanceRecord?.status || "Not marked",
            attendanceRecord,
          };
        }),
    [visibleEmployees, visibleDailyAttendance, selectedDate],
  );

  const showToast = (message, type = "success") => {
    setToastType(type);
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const deleteEmployee = async (employee) => {
    if (!currentUser || !isSuperAdmin) {
      showToast("Only SuperAdmin accounts can delete employees.", "error");
      return;
    }
    if (
      !window.confirm(
        `Permanently delete the employee record for ${employee.name}? Attendance records and audit history will be retained.`,
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "employees", employee.id));
      const refreshed = await loadEmployees();
      showToast(
        refreshed
          ? `${employee.name} was deleted.`
          : `${employee.name} was deleted, but the employee list could not be refreshed.`,
      );
    } catch (error) {
      console.error("Could not delete employee record from Firestore.", error);
      showToast(
        error.code === "permission-denied"
          ? "Firestore denied employee deletion. Only the protected SuperAdmin account can delete employee records."
          : `Could not delete ${employee.name}. Please try again.`,
        "error",
      );
    }
  };

  const downloadEmployeeTemplate = async () => {
    if (!currentUser || !isAdmin || employeeTemplateLoading) return;
    setEmployeeTemplateLoading(true);
    try {
      const buffer = await runEmployeeWorkbookWorker({ type: "template" });
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "peoplehub-employee-template.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Could not create the employee import template.", error);
      showToast(error.message || "Could not create the Excel template.");
    } finally {
      setEmployeeTemplateLoading(false);
    }
  };

  const getEmployeesForImport = async () => {
    if (!currentUser || !isAdmin) {
      throw new Error("Only Admin accounts can import employee records.");
    }
    try {
      const snapshot = await getDocsFromServer(collection(db, "employees"));
      return snapshot.docs.map((employeeDoc) => {
        const employee = employeeDoc.data();
        return { name: employee.name, godown: employee.godown };
      });
    } catch (error) {
      console.error(
        "Could not load current employees for import validation.",
        error,
      );
      if (error.code === "permission-denied") {
        throw new Error("Firestore denied access to employee records.");
      }
      throw new Error(
        "Could not check existing employees. Check your connection and try again.",
      );
    }
  };

  const saveImportedEmployees = async (rows) => {
    if (!currentUser || !isAdmin) {
      throw new Error("Only Admin accounts can import employee records.");
    }
    let importedCount = 0;
    try {
      for (let offset = 0; offset < rows.length; offset += 500) {
        const batchRows = rows.slice(offset, offset + 500);
        const batch = writeBatch(db);
        for (const row of batchRows) {
          const employeeRef = doc(collection(db, "employees"));
          batch.set(employeeRef, {
            name: row.name,
            role: row.role,
            jobRoleId: row.roleId,
            ...(row.godownId
              ? { godown: row.godown, godownId: row.godownId }
              : {}),
            ...(row.departmentId
              ? {
                  departmentId: row.departmentId,
                  department: row.department,
                }
              : {}),
            status: row.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        importedCount += batchRows.length;
      }
    } catch (error) {
      console.error(
        "Could not save an employee import batch to Firestore.",
        error,
      );
      if (importedCount > 0) {
        showToast(
          `Imported ${importedCount} ${importedCount === 1 ? "employee" : "employees"}; some eligible rows could not be imported.`,
        );
      }
      const saveError = new Error(
        error.code === "permission-denied"
          ? "Firestore denied this employee import. Verify your account permissions and Firestore security rules."
          : "Could not save an employee import batch. Please try again.",
      );
      saveError.importedCount = importedCount;
      throw saveError;
    }
    await loadEmployees();
    if (importedCount > 0) {
      showToast(
        `Successfully imported ${importedCount} ${importedCount === 1 ? "employee" : "employees"}.`,
      );
    }
    return importedCount;
  };

  const saveEmployee = async (data) => {
    if (!currentUser || !isAdmin) {
      throw new Error("Only Admin accounts can manage employee records.");
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const role = typeof data.role === "string" ? data.role.trim() : "";
    const roleEntry =
      catalogEntries(orgCatalogs.jobRoles, { includeArchived: true }).find(
        (entry) => entry.id === data.jobRoleId,
      ) || findCatalogEntryByName(orgCatalogs.jobRoles, role);
    const existingEmployee = modal?.employee;
    const assignmentType = data.assignmentType;
    const assignmentEntry = catalogEntries(
      orgCatalogs[assignmentType === "department" ? "departments" : "godowns"],
      { includeArchived: true },
    ).find((entry) => entry.id === data.assignmentId);
    const existingAssignmentId =
      assignmentType === "department"
        ? existingEmployee?.departmentId
        : existingEmployee?.godownId;
    const existingAssignmentName =
      assignmentType === "department"
        ? existingEmployee?.department
        : existingEmployee?.godown;
    const sameArchivedAssignment =
      !assignmentEntry?.active &&
      (existingAssignmentId === assignmentEntry?.id ||
        (!existingAssignmentId &&
          (existingAssignmentName === assignmentEntry?.name ||
            (assignmentEntry?.legacyAliases || []).includes(
              existingAssignmentName,
            ))));
    const sameArchivedRole =
      existingEmployee?.role === role &&
      (!existingEmployee?.jobRoleId ||
        existingEmployee.jobRoleId === roleEntry?.id);
    if (
      !name ||
      !role ||
      !["godown", "department"].includes(assignmentType) ||
      !assignmentEntry ||
      (!assignmentEntry.active && !sameArchivedAssignment) ||
      (!roleEntry?.active && !sameArchivedRole) ||
      !["Active", "Inactive"].includes(data.status)
    ) {
      throw new Error(
        "Enter a name, job role, exactly one valid active organisational assignment, and employment status.",
      );
    }

    const employeeData = {
      name,
      role,
      ...(roleEntry &&
      (roleEntry.active || existingEmployee?.jobRoleId === roleEntry.id)
        ? { jobRoleId: roleEntry.id }
        : {}),
      status: data.status,
      updatedAt: serverTimestamp(),
    };
    if (assignmentType === "godown") {
      employeeData.godown =
        sameArchivedAssignment && existingAssignmentName
          ? existingAssignmentName
          : assignmentEntry.name;
      if (
        assignmentEntry.active ||
        existingEmployee?.godownId === assignmentEntry.id
      ) {
        employeeData.godownId = assignmentEntry.id;
      }
      if (data.id) {
        employeeData.departmentId = deleteField();
        employeeData.department = deleteField();
      }
    } else {
      employeeData.departmentId = assignmentEntry.id;
      employeeData.department = assignmentEntry.name;
      if (data.id) {
        employeeData.godown = deleteField();
        employeeData.godownId = deleteField();
      }
    }

    if (!data.id) {
      let existingEmployees;
      try {
        existingEmployees = await getDocsFromServer(
          collection(db, "employees"),
        );
      } catch (error) {
        console.error(
          "Could not check existing employee names before registration.",
          error,
        );
        if (error.code === "permission-denied") {
          throw new Error("Firestore denied access to employee records.");
        }
        throw new Error(
          "Could not check existing employees. Check your connection and try again.",
        );
      }

      const normalizedName = normalizeComparisonName(name);
      const duplicateExists = existingEmployees.docs.some((employeeDoc) => {
        const existingName = employeeDoc.data().name;
        return (
          typeof existingName === "string" &&
          normalizeComparisonName(existingName) === normalizedName
        );
      });
      if (duplicateExists) {
        throw new Error("An employee with this name already exists.");
      }
    }

    try {
      if (data.id) {
        await updateDoc(doc(db, "employees", data.id), employeeData);
      } else {
        const profileSnap = await getDoc(
          doc(db, "users", auth.currentUser.uid),
        );

        console.log(
          "FIRESTORE USER PROFILE:",
          profileSnap.exists() ? profileSnap.data() : "USER DOCUMENT NOT FOUND",
        );

        await addDoc(collection(db, "employees"), {
          ...employeeData,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Could not save employee record to Firestore.", error);
      if (error.code === "permission-denied") {
        throw new Error(
          "Firestore denied this employee change. Verify your account permissions and Firestore security rules.",
        );
      }
      throw new Error("Could not save the employee record. Please try again.");
    }

    setModal(null);
    const refreshed = await loadEmployees();
    showToast(
      refreshed
        ? data.id
          ? "Employee details updated"
          : "Employee added to register"
        : "Employee saved, but the list could not be refreshed.",
    );
  };

  const saveAttendance = async (employeeId, status) => {
    if (
      !currentUser ||
      !statuses.includes(status) ||
      !isAttendanceDate(selectedDate)
    ) {
      setDailyAttendanceError("Choose a valid date and attendance status.");
      return;
    }

    const updatedByUid = auth.currentUser?.uid;
    if (!updatedByUid || updatedByUid !== currentUser.id) {
      setDailyAttendanceError(
        "Your sign-in session changed. Please sign in again before saving attendance.",
      );
      return;
    }

    const employee = employees.find(
      (record) => String(record.id) === String(employeeId),
    );
    const employeeIsDepartmentAssigned = Boolean(employee?.departmentId);
    const employeeAssignmentEntry = employeeIsDepartmentAssigned
      ? catalogEntries(orgCatalogs.departments, {
          includeArchived: true,
        }).find((entry) => entry.id === employee.departmentId)
      : catalogEntries(orgCatalogs.godowns, {
          includeArchived: true,
        }).find(
          (entry) =>
            entry.id === employee?.godownId ||
            entry.name === employee?.godown ||
            (entry.legacyAliases || []).includes(employee?.godown),
        );
    const employeeRoleEntry =
      findCatalogEntryByName(orgCatalogs.jobRoles, employee?.role) ||
      catalogEntries(orgCatalogs.jobRoles, { includeArchived: true }).find(
        (entry) => entry.id === employee?.jobRoleId,
      );
    if (
      !employee ||
      employee.status !== "Active" ||
      !employeeAssignmentEntry ||
      (!isAdmin &&
        (employeeIsDepartmentAssigned ||
          (employee.godownId && currentUser.godownId
            ? employee.godownId !== currentUser.godownId
            : employee.godown !== currentUser.godown))) ||
      (isAdmin &&
        activeDepartmentId !== "All departments" &&
        (!employeeIsDepartmentAssigned ||
          employee.departmentId !== activeDepartmentId)) ||
      (isAdmin &&
        activeDepartmentId === "All departments" &&
        scopedGodown !== "All godowns" &&
        (employeeIsDepartmentAssigned ||
          (employeeAssignmentEntry.name !== scopedGodown &&
            !(employeeAssignmentEntry.legacyAliases || []).includes(
              scopedGodown,
            ))))
    ) {
      setDailyAttendanceError(
        "You do not have permission to manage attendance for this employee.",
      );
      return;
    }

    const normalizedEmployeeId = String(employee.id);
    const recordId = attendanceDocumentId(normalizedEmployeeId, selectedDate);
    const recordRef = doc(db, "attendance", recordId);
    const auditRef = doc(collection(db, "attendanceAudit"));
    const matchingRecordConstraints = [
      where("employeeId", "==", normalizedEmployeeId),
      where("date", "==", selectedDate),
    ];
    if (!isAdmin) {
      matchingRecordConstraints.push(
        currentUser.godownId
          ? or(
              where("godown", "==", currentUser.godown),
              where("godownId", "==", currentUser.godownId),
            )
          : where("godown", "==", currentUser.godown),
      );
    }
    const matchingRecordsQuery = query(
      collection(db, "attendance"),
      ...matchingRecordConstraints,
      limit(2),
    );
    const updatedBy = currentUser.name || currentUser.email;

    setAttendanceSaving(true);
    setDailyAttendanceError("");
    let existingRecord = null;
    try {
      const matchingRecords = await getDocsFromServer(matchingRecordsQuery);
      if (matchingRecords.docs.length > 1) {
        throw new Error(
          "Multiple attendance records already exist for this employee and date. Resolve the duplicate records before changing attendance.",
        );
      }

      existingRecord = matchingRecords.docs[0] || null;
      const result = await runTransaction(db, async (transaction) => {
        const newRecordData = {
          employeeId: normalizedEmployeeId,
          employeeName: employee.name,
          role: employee.role,
          ...(employee.jobRoleId || employeeRoleEntry?.id
            ? { jobRoleId: employee.jobRoleId || employeeRoleEntry.id }
            : {}),
          ...(employeeIsDepartmentAssigned
            ? {
                departmentId: employee.departmentId,
                departmentName:
                  employee.department ||
                  orgCatalogs.departments[employee.departmentId]?.name ||
                  "",
              }
            : {
                godown: employee.godown,
                ...(employee.godownId || employeeAssignmentEntry?.id
                  ? {
                      godownId: employee.godownId || employeeAssignmentEntry.id,
                    }
                  : {}),
              }),
          date: selectedDate,
          status,
          updatedBy,
          updatedByUid,
          updatedAt: serverTimestamp(),
        };

        if (!existingRecord) {
          transaction.set(recordRef, {
            ...newRecordData,
            createdByUid: updatedByUid,
          });
          return { changed: true, corrected: false };
        }

        const existingSnapshot = await transaction.get(existingRecord.ref);
        if (!existingSnapshot.exists()) {
          throw new Error(
            "The attendance record changed while saving. Reload the selected date and try again.",
          );
        }

        const existingData = existingSnapshot.data();
        const previousStatus = existingData.status;
        if (typeof previousStatus !== "string") {
          throw new Error(
            "The existing attendance record has no valid status and cannot be corrected safely.",
          );
        }
        if (previousStatus === status) {
          return { changed: false, corrected: false };
        }

        transaction.update(existingRecord.ref, {
          status,
          updatedBy,
          updatedByUid,
          updatedAt: serverTimestamp(),
          lastAuditId: auditRef.id,
        });
        transaction.set(auditRef, {
          previousStatus,
          newStatus: status,
          attendanceId: existingRecord.id,
          employeeId: existingData.employeeId,
          employeeName: existingData.employeeName,
          role: existingData.role,
          ...(Object.hasOwn(existingData, "godown")
            ? { godown: existingData.godown }
            : {}),
          ...(Object.hasOwn(existingData, "godownId")
            ? { godownId: existingData.godownId }
            : {}),
          ...(existingData.jobRoleId
            ? { jobRoleId: existingData.jobRoleId }
            : {}),
          ...(Object.hasOwn(existingData, "departmentId")
            ? { departmentId: existingData.departmentId }
            : {}),
          ...(Object.hasOwn(existingData, "departmentName")
            ? { departmentName: existingData.departmentName }
            : {}),
          date: existingData.date,
          changedBy: updatedBy,
          changedByUid: updatedByUid,
          changedAt: serverTimestamp(),
        });
        return { changed: true, corrected: true };
      });

      const dailyLoaded = await loadDailyAttendance();
      if (!dailyLoaded) {
        showToast(
          "Attendance saved, but the selected date could not be refreshed.",
        );
      } else if (result.changed) {
        showToast(
          result.corrected ? "Attendance correction saved" : "Attendance saved",
        );
      }
    } catch (error) {
      let saveErrorMessage = attendanceSaveErrorMessage(error);
      if (error?.code === "permission-denied" && !existingRecord) {
        try {
          const currentRecords = await getDocsFromServer(matchingRecordsQuery);
          if (currentRecords.docs.length > 0) {
            saveErrorMessage =
              "Another user submitted attendance for this employee and date first. Reload the selected date before making a correction.";
          }
        } catch (verificationError) {
          console.error(
            "Could not verify whether another user submitted attendance first.",
            verificationError,
          );
        }
      }
      setDailyAttendanceError(saveErrorMessage);
      console.error("Could not save attendance to Firestore.", error);
    } finally {
      setAttendanceSaving(false);
    }
  };

  const openAddEmployee = () => {
    if (isAdmin) setModal({ type: "employee" });
  };
  const openEditEmployee = (employee) => {
    if (isAdmin) setModal({ type: "employee", employee });
  };
  const openEmployeeImport = () => {
    if (isAdmin) setModal({ type: "employeeImport" });
  };

  if (authLoading) {
    return (
      <AuthLoadingScreen message="Verifying your sign-in and account access..." />
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLogin={signIn}
        onResetPassword={resetPassword}
        authError={authError}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Users size={21} />
          </div>
          <div>
            <strong>PeopleHub</strong>
            <span>PEOPLE & ATTENDANCE</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" onClick={() => setMobileOpen(false)}>
          <NavItem
            to="/"
            icon={<LayoutDashboard size={18} />}
            label="Overview"
          />
          <NavItem
            to="/employees"
            icon={<Users size={18} />}
            label="Employee register"
          />
          <NavItem
            to="/attendance"
            icon={<ClipboardCheck size={18} />}
            label="Daily attendance"
          />
          <NavItem
            to="/calendar"
            icon={<CalendarDays size={18} />}
            label="Calendar"
          />
          {isSuperAdmin && (
            <NavItem
              to="/users"
              icon={<ShieldCheck size={18} />}
              label="User management"
            />
          )}
          {isAdmin && (
            <NavItem
              to="/reports"
              icon={<ChartNoAxesCombined size={18} />}
              label="Reports"
            />
          )}
        </nav>
        {isAdmin && departmentEntries.length > 0 && (
          <div className="godown-nav department-nav">
            <div className="section-head">
              <span>DEPARTMENTS</span>
              <span className="count-pill">{departmentEntries.length}</span>
            </div>
            {[
              { id: "All departments", name: "All departments" },
              ...departmentEntries,
            ].map((department) => (
              <button
                key={department.id}
                className={`godown-link ${activeDepartmentId === department.id ? "selected" : ""}`}
                onClick={() => {
                  setActiveDepartmentId(department.id);
                  setActiveGodown("All godowns");
                  navigate(location.pathname);
                  setMobileOpen(false);
                }}
              >
                <Building2 size={15} />
                <span>{department.name}</span>
              </button>
            ))}
          </div>
        )}
        {isAdmin ? (
          <div className="godown-nav">
            <div className="section-head">
              <span>GODOWNS</span>
              <span className="count-pill">{godownEntries.length}</span>
            </div>
            <button
              className={`godown-link ${activeGodown === "All godowns" ? "selected" : ""}`}
              onClick={() => {
                setActiveDepartmentId("All departments");
                setActiveGodown("All godowns");
                navigate(location.pathname);
                setMobileOpen(false);
              }}
            >
              <Building2 size={16} />
              <span>All godowns</span>
            </button>
            {godownEntries.map(({ id, name }) => (
              <button
                key={id}
                className={`godown-link ${activeGodown === name ? "selected" : ""}`}
                onClick={() => {
                  setActiveDepartmentId("All departments");
                  setActiveGodown(name);
                  navigate(location.pathname);
                  setMobileOpen(false);
                }}
              >
                <Warehouse size={15} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="staff-scope">
            <div className="section-head">MY GODOWN</div>
            <div className="my-godown">
              <Warehouse size={17} />
              <span>{currentUserGodownName}</span>
            </div>
          </div>
        )}
        <div className="sidebar-bottom">
          <NavItem
            to="/settings"
            icon={<Settings size={18} />}
            label="Settings"
            onClick={() => setMobileOpen(false)}
          />
          <div className="help-card">
            <div className="help-icon">
              <ShieldCheck size={17} />
            </div>
            <strong>Records made easier</strong>
            <p>
              Bring employee details and daily attendance together in one clear
              view.
            </p>
          </div>
          <div className="profile-mini">
            <div className="avatar">{initials(currentUser.name)}</div>
            <div className="profile-copy">
              <strong>{currentUser.name}</strong>
              <span>{currentUser.role} account</span>
            </div>
            <button
              className="icon-button profile-signout"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              PeopleHub <ChevronRight size={14} />{" "}
              <strong>
                {titleMap[location.pathname] ||
                  (location.pathname.startsWith("/employees/")
                    ? "Employee profile"
                    : "Workspace")}
              </strong>
            </div>
          </div>
          <div className="top-actions">
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">{initials(currentUser.name)}</div>
            <button
              className="btn btn-secondary btn-small top-signout"
              onClick={signOut}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </header>

        <div className="content">
          {employeesError && location.pathname !== "/employees" && (
            <div className="employee-load-error employee-load-error-banner">
              <span role="alert">{employeesError}</span>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={loadEmployees}
              >
                Retry
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  employees={departmentScopedEmployees}
                  attendance={departmentScopedDailyAttendance}
                  date={selectedDate}
                  setDate={setSelectedDate}
                  isAdmin={isAdmin}
                  currentUserRole={currentUser.role}
                  activeGodown={
                    isAdmin ? activeScopeLabel : currentUserGodownName
                  }
                  setActiveGodown={setActiveGodown}
                  setActiveDepartmentId={setActiveDepartmentId}
                  godowns={godownEntries}
                  attendanceLoading={dailyRefreshPending}
                  navigate={navigate}
                  setSearch={setSearch}
                />
              }
            />
            <Route
              path="/employees"
              element={
                <Employees
                  employees={visibleEmployees}
                  search={search}
                  setSearch={setSearch}
                  onAdd={openAddEmployee}
                  onEdit={openEditEmployee}
                  onDelete={deleteEmployee}
                  onImport={openEmployeeImport}
                  onDownloadTemplate={downloadEmployeeTemplate}
                  templateLoading={employeeTemplateLoading}
                  isAdmin={isAdmin}
                  isSuperAdmin={isSuperAdmin}
                  activeGodown={
                    isAdmin ? activeScopeLabel : currentUserGodownName
                  }
                  loading={employeesLoading}
                  error={employeesError}
                  onRetry={loadEmployees}
                />
              }
            />
            <Route
              path="/employees/:employeeId"
              element={
                <EmployeeProfile
                  currentUser={currentUser}
                  catalogs={orgCatalogs}
                />
              }
            />
            <Route
              path="/attendance"
              element={
                <Attendance
                  rows={attendanceRows}
                  date={selectedDate}
                  setDate={setSelectedDate}
                  onMark={saveAttendance}
                  isAdmin={isAdmin}
                  activeGodown={
                    isAdmin ? activeScopeLabel : currentUserGodownName
                  }
                  loading={dailyRefreshPending}
                  hasCurrentData={dailyDataKey === dailyAttendanceKey}
                  saving={attendanceSaving}
                  error={dailyAttendanceError}
                  onRetry={loadDailyAttendance}
                />
              }
            />
            <Route
              path="/calendar"
              element={
                <CalendarPage
                  attendance={departmentScopedCalendarAttendance}
                  employees={departmentScopedEmployees}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  navigate={navigate}
                  month={calendarMonth}
                  setMonth={setCalendarMonth}
                  loading={calendarRefreshPending}
                  error={visibleCalendarError}
                  onRetry={loadCalendarAttendance}
                />
              }
            />
            <Route
              path="/reports"
              element={
                isAdmin ? (
                  <Reports
                    employees={visibleEmployees}
                    attendance={departmentScopedReportAttendance}
                    activeGodown={
                      isAdmin ? activeScopeLabel : currentUserGodownName
                    }
                    from={reportFrom}
                    to={reportTo}
                    previousFrom={loadedReportFrom}
                    previousTo={loadedReportTo}
                    setFrom={setReportFrom}
                    setTo={setReportTo}
                    loading={reportRefreshPending}
                    resultsAreStale={reportResultsAreStale}
                    hasMore={reportHasMore}
                    error={visibleReportError}
                    onRetry={() => loadReportAttendance(false)}
                    onLoadMore={() => loadReportAttendance(true)}
                    onDownload={downloadAttendanceReport}
                    exporting={reportExportLoading}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/users"
              element={
                isSuperAdmin ? (
                  <UsersPage
                    accounts={userAccounts}
                    catalogs={orgCatalogs}
                    catalogStored={orgCatalogStored}
                    currentUserId={currentUser.id}
                    loading={staffAccountsLoading}
                    error={staffAccountsError}
                    updatingAccountId={updatingStaffAccountId}
                    onRetry={loadStaffAccounts}
                    onUpdate={updateStaffAccount}
                    onCreate={() => navigate("/users/new")}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/users/new"
              element={
                isSuperAdmin ? (
                  <CreateStaffPage
                    accounts={userAccounts}
                    catalogs={orgCatalogs}
                    onCancel={() => navigate("/users")}
                    onCreate={createStaffAccount}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  isAdmin={isAdmin}
                  isSuperAdmin={isSuperAdmin}
                  activeGodown={isAdmin ? scopedGodown : currentUserGodownName}
                  catalogs={orgCatalogs}
                  catalogStored={orgCatalogStored}
                  loading={orgCatalogLoading}
                  error={orgCatalogError}
                  onRefresh={() => loadOrgCatalogs({ force: true })}
                  onSave={saveOrgCatalogs}
                />
              }
            />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <footer className="footer">
          <span>PeopleHub UI prototype</span>
          <span>Employee records and attendance, organized in one place.</span>
        </footer>
      </main>

      {isAdmin && modal?.type === "employee" && (
        <EmployeeModal
          employee={modal.employee}
          onClose={() => setModal(null)}
          onSave={saveEmployee}
          isAdmin={isAdmin}
          catalogs={orgCatalogs}
          defaultGodown={
            scopedGodown === "All godowns"
              ? godownEntries[0]?.name || ""
              : scopedGodown
          }
        />
      )}
      {isAdmin && modal?.type === "employeeImport" && (
        <EmployeeImportModal
          onClose={() => setModal(null)}
          onGetEmployees={getEmployeesForImport}
          onSave={saveImportedEmployees}
          catalogs={orgCatalogs}
        />
      )}
      {toast && (
        <div
          className={`toast ${toastType === "error" ? "toast-error" : ""}`}
          role={toastType === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {toastType === "error" ? (
            <CircleX size={17} />
          ) : (
            <CircleCheck size={17} />
          )}
          {toast}
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin, onResetPassword, authError }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const submitLogin = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(authErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setResetting(true);
    try {
      await onResetPassword(email);
      setMessage(
        "If an account exists for this email, a reset link has been sent.",
      );
    } catch (resetError) {
      if (resetError.code === "auth/user-not-found") {
        setMessage(
          "If an account exists for this email, a reset link has been sent.",
        );
      } else {
        setError(authErrorMessage(resetError, "reset"));
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand">
          <div className="brand-mark">
            <Users size={21} />
          </div>
          <div>
            <strong>PeopleHub</strong>
            <span>PEOPLE & ATTENDANCE</span>
          </div>
        </div>
        <div className="auth-story-copy">
          <span className="auth-kicker">A CLEARER VIEW OF YOUR PEOPLE</span>
          <h1>Better people operations start here.</h1>
          <p>
            Keep your employee register and daily attendance organized across
            every godown, all in one place.
          </p>
          <div className="auth-benefits">
            <div>
              <span className="auth-benefit-icon">
                <Users size={17} />
              </span>
              <span>
                <strong>One trusted workspace</strong>
                <small>Employee details, ready when you need them.</small>
              </span>
            </div>
            <div>
              <span className="auth-benefit-icon">
                <ShieldCheck size={17} />
              </span>
              <span>
                <strong>Access that fits your role</strong>
                <small>Company-wide or assigned-godown views.</small>
              </span>
            </div>
          </div>
        </div>
        <div className="auth-story-foot">
          <span>PeopleHub workspace</span>
          <span>People & attendance, made clearer.</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <div className="brand-mark">
              <Users size={20} />
            </div>
            <strong>PeopleHub</strong>
          </div>
          <div className="auth-heading">
            <div className="eyebrow">
              {mode === "login" ? "WELCOME BACK" : "ACCOUNT RECOVERY"}
            </div>
            <h2>
              {mode === "login"
                ? "Sign in to PeopleHub"
                : "Forgot your password?"}
            </h2>
            <p>
              {mode === "login"
                ? "Enter your work account details to continue."
                : "Enter your account email to request a reset link."}
            </p>
          </div>

          {mode === "login" ? (
            <form className="auth-form" onSubmit={submitLogin}>
              <div className="auth-field">
                <label htmlFor="login-email">Email address</label>
                <span className="auth-input-wrap">
                  <Mail size={17} />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </span>
              </div>
              <div className="auth-field">
                <label htmlFor="login-password">Password</label>
                <span className="auth-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </div>
              <div className="auth-form-options">
                <span className="auth-secure-note">
                  <ShieldCheck size={14} /> Private workspace
                </span>
                <button
                  className="auth-link"
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setError("");
                    setMessage("");
                  }}
                >
                  Forgot password?
                </button>
              </div>
              {error && (
                <div className="auth-feedback error" role="alert">
                  {error}
                </div>
              )}
              {authError && !error && (
                <div className="auth-feedback error" role="alert">
                  {authError}
                </div>
              )}
              <button
                className="btn btn-primary auth-submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Signing in..." : "Sign in"}{" "}
                <ArrowUpRight size={16} />
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitReset}>
              <div className="auth-field">
                <label htmlFor="reset-email">Email address</label>
                <span className="auth-input-wrap">
                  <Mail size={17} />
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    required
                  />
                </span>
              </div>
              {error && (
                <div className="auth-feedback error" role="alert">
                  {error}
                </div>
              )}
              {message && (
                <div className="auth-feedback info" role="status">
                  {message}
                </div>
              )}
              <button
                className="btn btn-primary auth-submit"
                type="submit"
                disabled={resetting}
              >
                {resetting ? "Sending..." : "Request reset link"}{" "}
                <ArrowUpRight size={16} />
              </button>
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
              >
                <ChevronRight className="flip" size={15} /> Back to sign in
              </button>
            </form>
          )}

          <p className="auth-prototype-note">
            Authentication, password recovery, and account access are managed by
            Firebase.
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthLoadingScreen({
  message = "Verifying your sign-in and account access...",
}) {
  return (
    <main className="auth-page" aria-busy="true">
      <section className="auth-story">
        <div className="auth-brand">
          <div className="brand-mark">
            <Users size={21} />
          </div>
          <div>
            <strong>PeopleHub</strong>
            <span>PEOPLE & ATTENDANCE</span>
          </div>
        </div>
        <div className="auth-story-copy">
          <span className="auth-kicker">A CLEARER VIEW OF YOUR PEOPLE</span>
          <h1>Better people operations start here.</h1>
          <p>Restoring your secure PeopleHub workspace.</p>
        </div>
        <div className="auth-story-foot">
          <span>PeopleHub workspace</span>
          <span>People & attendance, made clearer.</span>
        </div>
      </section>
      <section className="auth-panel" role="status" aria-live="polite">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <div className="brand-mark">
              <Users size={20} />
            </div>
            <strong>PeopleHub</strong>
          </div>
          <div className="auth-heading">
            <div className="eyebrow">SECURE WORKSPACE</div>
            <h2>Restoring your session</h2>
            <p>{message}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function CreateStaffPage({ accounts, catalogs, onCancel, onCreate }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Staff");
  const [godownId, setGodownId] = useState(
    catalogEntries(catalogs.godowns)[0]?.id || "",
  );
  const availableGodowns = catalogEntries(catalogs.godowns);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (
      accounts.some(
        (account) => account.email.toLowerCase() === email.trim().toLowerCase(),
      )
    ) {
      nextErrors.email = "An account with this email already exists.";
    }
    if (password.length < 8) {
      nextErrors.password = "Use a password with at least 8 characters.";
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onCreate({
        email: email.trim(),
        password,
        role,
        godownId: role === "Staff" ? godownId : null,
      });
    } catch (error) {
      setErrors({ submit: createStaffErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="NEW STAFF ACCOUNT"
        title="Create a staff account"
        subtitle="Set up sign-in details, account role, and access scope."
        action={
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        }
      />
      <form className="panel staff-registration" onSubmit={submit}>
        <div className="registration-section-heading">
          <div className="settings-icon">
            <UserRound size={19} />
          </div>
          <div>
            <h2>Account details</h2>
            <p>These details will be used to sign in to PeopleHub.</p>
          </div>
        </div>
        <div className="registration-fields">
          <div className={`auth-field ${errors.email ? "has-error" : ""}`}>
            <label htmlFor="staff-email">Work email</label>
            <input
              id="staff-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@company.com"
              required
            />
            {errors.email && <small>{errors.email}</small>}
          </div>
          <div className="registration-access">
            <div>
              <label htmlFor="staff-account-role">Account role</label>
              <select
                id="staff-account-role"
                className="staff-account-role-select"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                required
              >
                <option value="Staff">Staff</option>
                <option value="Admin">Admin</option>
              </select>
              <small>
                {role === "Staff"
                  ? "Staff accounts are limited to one assigned godown."
                  : "Admin accounts can access all godowns and operational features."}
              </small>
            </div>
            {role === "Staff" && (
              <div className="auth-field">
                <label htmlFor="staff-godown">Assigned godown</label>
                <select
                  id="staff-godown"
                  value={godownId}
                  onChange={(event) => setGodownId(event.target.value)}
                  required
                >
                  {availableGodowns.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <small>This account will only see this godown.</small>
              </div>
            )}
          </div>
          <div className="registration-passwords">
            <div className={`auth-field ${errors.password ? "has-error" : ""}`}>
              <label htmlFor="staff-password">Temporary password</label>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
              {errors.password && <small>{errors.password}</small>}
            </div>
            <div
              className={`auth-field ${errors.confirmPassword ? "has-error" : ""}`}
            >
              <label htmlFor="staff-confirm-password">Confirm password</label>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  id="staff-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter password again"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowConfirmPassword((shown) => !shown)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </span>
              {errors.confirmPassword && (
                <small>{errors.confirmPassword}</small>
              )}
            </div>
          </div>
        </div>
        <div className="registration-notice">
          <ShieldCheck size={16} />
          <span>
            Only the protected SuperAdmin can create account profiles. The
            secondary Firebase Authentication client preserves your session, but
            a trusted backend is required to restrict Authentication user
            creation itself.
          </span>
        </div>
        {errors.submit && (
          <div
            className="employee-load-error employee-load-error-banner"
            role="alert"
          >
            {errors.submit}
          </div>
        )}
        <div className="registration-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            <Plus size={16} /> Create {role === "Staff" ? "Staff" : "Admin"}{" "}
            account
          </button>
        </div>
      </form>
    </>
  );
}

function firestoreErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Firestore denied the profile write. Verify the deployed Firestore security rules.";
  }
  if (
    error?.code === "unavailable" ||
    error?.code === "network-request-failed"
  ) {
    return "Check your connection and try again.";
  }
  return "Please check your connection and Firestore configuration.";
}

function createStaffErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Use a stronger password with at least 8 characters.";
    case "auth/network-request-failed":
      return "Check your internet connection and try again.";
    case "auth/operation-not-allowed":
      return "Email and password account creation is not enabled in Firebase Authentication.";
    default:
      return (
        error?.message ||
        "Could not create the staff account. Please try again."
      );
  }
}

function NavItem({ to, icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, note, icon, tone, onClick }) {
  return (
    <button
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
    >
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </button>
  );
}

function Dashboard({
  employees,
  attendance,
  date,
  setDate,
  isAdmin,
  currentUserRole,
  activeGodown,
  setActiveGodown,
  setActiveDepartmentId,
  godowns,
  attendanceLoading,
  navigate,
  setSearch,
}) {
  const hour = new Date().getHours();
  const selectedGodown = godowns.find((entry) => entry.name === activeGodown);
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const scoped = employees.filter(
    (e) =>
      e.status === "Active" &&
      ((isAdmin && activeGodown === "All godowns") ||
        (isAdmin && !selectedGodown) ||
        e.godown === activeGodown ||
        (selectedGodown &&
          (e.godownId === selectedGodown.id ||
            (selectedGodown.legacyAliases || []).includes(e.godown)))),
  );
  const todayRows = scoped.map(
    (e) =>
      attendance.find(
        (a) => String(a.employeeId) === String(e.id) && a.date === date,
      )?.status || "Not marked",
  );
  const count = (s) => todayRows.filter((x) => x === s).length;
  const marked = todayRows.filter((x) => x !== "Not marked").length;
  const goStatus = (status) => navigate("/attendance", { state: { status } });
  return (
    <>
      <PageHeading
        eyebrow={isAdmin ? "COMPANY OVERVIEW" : "STAFF WORKSPACE"}
        title={
          isAdmin
            ? `${greeting}, ${currentUserRole}`
            : "Welcome to your workspace"
        }
        subtitle={
          isAdmin
            ? "Here’s a snapshot of your employee register and attendance."
            : "Manage the employee register and attendance for your assigned godown."
        }
        action={
          <button
            className="btn btn-primary"
            onClick={() => navigate("/attendance")}
          >
            <ClipboardCheck size={16} /> Mark attendance
          </button>
        }
      />
      {attendanceLoading && (
        <div
          className="data-refresh-indicator"
          role="status"
          aria-live="polite"
        >
          Updating attendance for {date}…
        </div>
      )}
      <div className="notice-strip">
        <div className="notice-symbol">
          <ShieldCheck size={17} />
        </div>
        <div>
          <strong>
            Your team's employee records and attendance, organized in one place.
          </strong>
          <span>
            Keep your employee register and daily attendance clear and easy to
            manage.
          </span>
        </div>
      </div>
      <div className="section-title-row">
        <div>
          <h2>Attendance snapshot</h2>
          <p>Daily summary for the selected date</p>
        </div>
        <label className="date-input">
          <CalendarDays size={16} />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <div className="stats-grid dashboard-stats">
        <StatCard
          label="Active employees"
          value={scoped.length}
          note="In selected view"
          icon={<Users size={19} />}
          tone="blue"
          onClick={() => navigate("/employees")}
        />
        <StatCard
          label="Present"
          value={attendanceLoading ? "…" : count("Present")}
          note={
            attendanceLoading
              ? "Updating…"
              : `${marked ? Math.round((count("Present") / marked) * 100) : 0}% of marked`
          }
          icon={<CircleCheck size={19} />}
          tone="green"
          onClick={() => goStatus("Present")}
        />
        <StatCard
          label="Absent"
          value={attendanceLoading ? "…" : count("Absent")}
          note="Needs follow-up"
          icon={<CircleX size={19} />}
          tone="red"
          onClick={() => goStatus("Absent")}
        />
        <StatCard
          label="Sick"
          value={attendanceLoading ? "…" : count("Sick")}
          note="Marked sick"
          icon={<Clock3 size={19} />}
          tone="orange"
          onClick={() => goStatus("Sick")}
        />
        <StatCard
          label="On leave"
          value={attendanceLoading ? "…" : count("On Leave")}
          note="Approved / reported leave"
          icon={<CalendarClock size={19} />}
          tone="purple"
          onClick={() => goStatus("On Leave")}
        />
        <StatCard
          label="Overtime"
          value={attendanceLoading ? "…" : count("Overtime")}
          note="Worked beyond scheduled hours"
          icon={<Clock3 size={19} />}
          tone="blue"
          onClick={() => goStatus("Overtime")}
        />
      </div>
      {isAdmin && (activeGodown === "All godowns" || selectedGodown) && (
        <section className="panel godown-panel">
          <div className="panel-heading">
            <div>
              <h2>Godown overview</h2>
              <p>Choose a godown to view its register and attendance</p>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setActiveDepartmentId("All departments");
                setActiveGodown("All godowns");
                navigate("/employees");
              }}
            >
              View all employees <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="godown-grid">
            {godowns.map(({ id, name, legacyAliases = [] }) => {
              const activeMembers = employees.filter(
                (e) =>
                  e.status === "Active" &&
                  (e.godownId === id ||
                    e.godown === name ||
                    legacyAliases.includes(e.godown)),
              );
              const members = activeMembers.length;
              const present = activeMembers.filter((e) =>
                attendance.some(
                  (a) =>
                    a.employeeId === e.id &&
                    a.date === date &&
                    a.status === "Present",
                ),
              ).length;
              return (
                <button
                  className="godown-card"
                  key={id}
                  onClick={() => {
                    setActiveDepartmentId("All departments");
                    setActiveGodown(name);
                    navigate("/employees");
                  }}
                >
                  <div className="godown-card-top">
                    <span className="warehouse-icon">
                      <Warehouse size={17} />
                    </span>
                    <ChevronRight size={16} />
                  </div>
                  <strong>{name}</strong>
                  <div className="godown-meta">
                    <span>{members} active employees</span>
                    <span>{present} present</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Attendance completion</h2>
            <p>How many employees have an attendance entry for {date}</p>
          </div>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => navigate("/attendance")}
          >
            Open attendance <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="completion-row">
          <div className="completion-number">
            {attendanceLoading ? "…" : marked}
            <span> / {scoped.length} marked</span>
          </div>
          <span className="completion-percent">
            {attendanceLoading
              ? "Updating"
              : `${scoped.length ? Math.round((marked / scoped.length) * 100) : 0}% complete`}
          </span>
        </div>
        <div className="progress-track">
          <div
            style={{
              width: `${scoped.length ? (marked / scoped.length) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="legend">
          <span>
            <i className="dot green-dot" />
            Marked
          </span>
          <span>
            <i className="dot grey-dot" />
            Not yet marked
          </span>
        </div>
      </section>
    </>
  );
}

function EmployeeProfile({ currentUser, catalogs }) {
  const { employeeId = "" } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [auditRecords, setAuditRecords] = useState([]);
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [appliedAuditRange, setAppliedAuditRange] = useState({
    from: "",
    to: "",
  });
  const [auditRangeError, setAuditRangeError] = useState("");
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditMoreError, setAuditMoreError] = useState("");
  const [auditCursor, setAuditCursor] = useState(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditReloadKey, setAuditReloadKey] = useState(0);
  const auditQueryGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [month, setMonth] = useState(() => firstDayOfMonth(new Date()));

  useEffect(() => {
    let active = true;
    const requestGeneration = ++auditQueryGeneration.current;
    setAuditLoading(true);
    setAuditLoadingMore(false);
    setAuditError("");
    setAuditMoreError("");
    setAuditRecords([]);
    setAuditCursor(null);
    setAuditHasMore(false);

    getDocsFromServer(
      createEmployeeAuditQuery(
        employeeId,
        currentUser.role,
        currentUser.godown,
        currentUser.godownId,
        appliedAuditRange,
      ),
    )
      .then((snapshot) => {
        if (!active || requestGeneration !== auditQueryGeneration.current)
          return;
        const page = snapshot.docs.slice(0, employeeAuditPageSize);
        setAuditRecords(
          page.map((auditDoc) => ({ id: auditDoc.id, ...auditDoc.data() })),
        );
        setAuditCursor(page[page.length - 1] || null);
        setAuditHasMore(snapshot.docs.length > employeeAuditPageSize);
      })
      .catch((loadError) => {
        if (!active || requestGeneration !== auditQueryGeneration.current)
          return;
        console.error(
          "Could not load employee attendance audit history.",
          loadError,
        );
        setAuditError(
          loadError.code === "permission-denied"
            ? "You do not have permission to view this attendance change history."
            : loadError.code === "failed-precondition"
              ? "Firestore requires a composite index to load this attendance change history."
              : "Could not load attendance change history. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (active && requestGeneration === auditQueryGeneration.current) {
          setAuditLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    appliedAuditRange,
    auditReloadKey,
    currentUser.godown,
    currentUser.godownId,
    currentUser.role,
    employeeId,
  ]);

  const loadMoreAudit = async () => {
    if (!auditCursor || auditLoadingMore) return;
    const requestGeneration = auditQueryGeneration.current;
    setAuditLoadingMore(true);
    setAuditMoreError("");
    try {
      const snapshot = await getDocsFromServer(
        createEmployeeAuditQuery(
          employeeId,
          currentUser.role,
          currentUser.godown,
          currentUser.godownId,
          appliedAuditRange,
          auditCursor,
        ),
      );
      if (requestGeneration !== auditQueryGeneration.current) return;
      const page = snapshot.docs.slice(0, employeeAuditPageSize);
      setAuditRecords((existing) => [
        ...existing,
        ...page.map((auditDoc) => ({ id: auditDoc.id, ...auditDoc.data() })),
      ]);
      setAuditCursor(page[page.length - 1] || auditCursor);
      setAuditHasMore(snapshot.docs.length > employeeAuditPageSize);
    } catch (loadError) {
      if (requestGeneration !== auditQueryGeneration.current) return;
      console.error(
        "Could not load more employee attendance audit history.",
        loadError,
      );
      setAuditMoreError(
        loadError.code === "permission-denied"
          ? "Firestore denied access to the next attendance history page."
          : loadError.code === "failed-precondition"
            ? "Firestore requires a composite index to load the next history page."
            : "Could not load more attendance history. Check your connection and retry.",
      );
    } finally {
      if (requestGeneration === auditQueryGeneration.current) {
        setAuditLoadingMore(false);
      }
    }
  };

  const applyAuditRange = () => {
    if (auditFrom && auditTo && auditFrom > auditTo) {
      setAuditRangeError("The start date must be on or before the end date.");
      return;
    }
    setAuditRangeError("");
    setAppliedAuditRange({ from: auditFrom, to: auditTo });
  };

  const clearAuditRange = () => {
    setAuditFrom("");
    setAuditTo("");
    setAuditRangeError("");
    setAppliedAuditRange({ from: "", to: "" });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEmployee(null);
    setRecords([]);

    const employeeRequest = getDoc(doc(db, "employees", employeeId))
      .then((snapshot) =>
        snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
      )
      .catch((readError) => {
        if (readError.code === "permission-denied") return null;
        throw readError;
      });
    const attendanceConstraints = [
      where("employeeId", "==", String(employeeId)),
    ];
    if (currentUser.role === "Staff") {
      attendanceConstraints.push(
        currentUser.godownId
          ? or(
              where("godown", "==", currentUser.godown),
              where("godownId", "==", currentUser.godownId),
            )
          : where("godown", "==", currentUser.godown),
      );
    }

    Promise.all([
      employeeRequest,
      getDocs(query(collection(db, "attendance"), ...attendanceConstraints)),
    ])
      .then(([employeeRecord, attendanceSnapshot]) => {
        if (!active) return;
        const history = attendanceSnapshot.docs
          .map((attendanceDoc) => ({
            id: attendanceDoc.id,
            ...attendanceDoc.data(),
          }))
          .filter(
            (record) =>
              String(record.employeeId) === String(employeeId) &&
              statuses.includes(record.status) &&
              isAttendanceDate(record.date),
          );
        const historicalIdentity = [...history].sort((left, right) =>
          right.date.localeCompare(left.date),
        )[0];
        if (employeeRecord) {
          setEmployee(employeeRecord);
        } else if (historicalIdentity) {
          setEmployee({
            id: String(employeeId),
            name: historicalIdentity.employeeName || "Former employee",
            role: historicalIdentity.role || "Not recorded",
            ...(historicalIdentity.departmentId
              ? {
                  departmentId: historicalIdentity.departmentId,
                  department:
                    historicalIdentity.departmentName || "Not recorded",
                }
              : { godown: historicalIdentity.godown || "Not recorded" }),
            status: "Deleted employee record",
            createdAt: null,
            historicalSnapshot: true,
          });
        } else {
          setError(
            "This employee profile is unavailable, or no historical attendance is accessible for your account.",
          );
        }
        setRecords(history);
      })
      .catch((loadError) => {
        if (!active) return;
        console.error("Could not load employee profile history.", loadError);
        setError(
          loadError.code === "permission-denied"
            ? "You do not have permission to view this employee profile or its attendance history."
            : "Could not load this employee profile. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    currentUser.godown,
    currentUser.id,
    currentUser.role,
    employeeId,
    reloadKey,
  ]);

  useEffect(() => {
    setMonth(firstDayOfMonth(new Date()));
  }, [employeeId]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const calendarDays = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarDays.length % 7) calendarDays.push(null);

  const recordsByDate = new Map(records.map((record) => [record.date, record]));
  const summary = statuses.map((status) => ({
    status,
    count: records.filter((record) => record.status === status).length,
  }));
  const registeredDate = employee?.createdAt
    ? formatEmployeeRegistrationDate(employee.createdAt)
    : "Not available";
  const displayRole =
    catalogEntries(catalogs.jobRoles, { includeArchived: true }).find(
      (entry) =>
        entry.id === employee?.jobRoleId ||
        entry.name === employee?.role ||
        (entry.legacyAliases || []).includes(employee?.role),
    )?.name || employee?.role;
  const displayGodown =
    catalogEntries(catalogs.godowns, { includeArchived: true }).find(
      (entry) =>
        entry.id === employee?.godownId ||
        entry.name === employee?.godown ||
        (entry.legacyAliases || []).includes(employee?.godown),
    )?.name || employee?.godown;
  const displayDepartment =
    catalogEntries(catalogs.departments, { includeArchived: true }).find(
      (entry) =>
        entry.id === employee?.departmentId ||
        entry.name === employee?.department ||
        (entry.legacyAliases || []).includes(employee?.department),
    )?.name || employee?.department;

  return (
    <>
      <PageHeading
        eyebrow="EMPLOYEE PROFILE"
        title={employee?.name || "Employee profile"}
        subtitle="Employee details and attendance history."
        action={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/employees")}
          >
            <Users size={16} /> Employee register
          </button>
        }
      />
      {loading && (
        <div
          className="data-refresh-indicator"
          role="status"
          aria-live="polite"
        >
          Loading employee profile and attendance history…
        </div>
      )}
      {error && (
        <div
          className="employee-load-error employee-load-error-banner"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {employee && (
        <>
          <section className="panel employee-profile-details">
            <div className="employee-profile-identity">
              <div className="avatar">{initials(employee.name)}</div>
              <div>
                <h2>{employee.name}</h2>
                <span>
                  {employee.historicalSnapshot
                    ? "Identity recovered from historical attendance"
                    : `EMP-${String(employee.id).padStart(4, "0")}`}
                </span>
              </div>
            </div>
            <dl className="employee-profile-fields">
              <div>
                <dt>Employee reference</dt>
                <dd>EMP-{String(employee.id).padStart(4, "0")}</dd>
              </div>
              <div>
                <dt>Job role</dt>
                <dd>{displayRole || "Not available"}</dd>
              </div>
              <div>
                <dt>Assignment</dt>
                <dd>
                  {employee.departmentId
                    ? `Department: ${displayDepartment || "Not available"}`
                    : `Godown: ${displayGodown || "Not available"}`}
                </dd>
              </div>
              <div>
                <dt>Employment status</dt>
                <dd>{employee.status || "Not available"}</dd>
              </div>
              <div>
                <dt>Date registered</dt>
                <dd>{registeredDate}</dd>
              </div>
            </dl>
          </section>

          <section className="employee-history-summary">
            {summary.map(({ status, count }) => (
              <div className="panel employee-history-stat" key={status}>
                <span
                  className={`mini-dot ${status.toLowerCase().replace(" ", "-")}`}
                />
                <span>{status}</span>
                <strong>{loading ? "…" : count}</strong>
              </div>
            ))}
            <div className="panel employee-history-stat total-history-stat">
              <span>Total attendance records</span>
              <strong>{loading ? "…" : records.length}</strong>
            </div>
          </section>

          {error && records.length === 0 ? null : (
            <section className="panel employee-history-calendar">
              <div className="calendar-head">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
                >
                  <ChevronRight className="flip" size={18} />
                </button>
                <h2>
                  {month.toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="calendar-grid weekday-grid">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ),
                )}
              </div>
              <div className="calendar-grid employee-history-calendar-grid">
                {calendarDays.map((day, index) => {
                  const date = day
                    ? `${year}-${fmt(monthIndex + 1)}-${fmt(day)}`
                    : "";
                  const record = recordsByDate.get(date);
                  const statusClassName = record
                    ? `attendance-day-${record.status.toLowerCase().replaceAll(" ", "-")}`
                    : "";
                  return (
                    <div
                      key={`${date || "blank"}-${index}`}
                      className={`employee-history-day ${statusClassName}`}
                      aria-label={
                        day
                          ? `${date}${record ? `: ${record.status}` : ""}`
                          : undefined
                      }
                    >
                      {day && <span>{day}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="employee-history-legend">
                {statuses.map((status) => (
                  <span key={status}>
                    <i
                      className={`attendance-legend-dot attendance-day-${status.toLowerCase().replaceAll(" ", "-")}`}
                    />
                    {status}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="panel employee-audit-history">
        <div className="panel-heading employee-audit-heading">
          <div>
            <h2>Attendance change history</h2>
            <p>
              Corrections are shown newest first. Date filters use the
              correction timestamp.
            </p>
          </div>
        </div>
        <div className="employee-audit-filters">
          <label>
            <span>Corrected from</span>
            <input
              type="date"
              value={auditFrom}
              onChange={(event) => setAuditFrom(event.target.value)}
            />
          </label>
          <label>
            <span>Corrected through</span>
            <input
              type="date"
              value={auditTo}
              onChange={(event) => setAuditTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={applyAuditRange}
            disabled={auditLoading}
          >
            Apply range
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={clearAuditRange}
            disabled={auditLoading}
          >
            Clear
          </button>
        </div>
        {auditRangeError && (
          <div className="employee-load-error-banner" role="alert">
            {auditRangeError}
          </div>
        )}
        {auditLoading && (
          <div
            className="data-refresh-indicator"
            role="status"
            aria-live="polite"
          >
            Loading attendance change history…
          </div>
        )}
        {!auditLoading && auditError && (
          <div
            className="employee-load-error employee-load-error-banner"
            role="alert"
          >
            <span>{auditError}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setAuditReloadKey((key) => key + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {!auditLoading && !auditError && auditRecords.length === 0 && (
          <div className="empty-state employee-audit-empty">
            No attendance corrections found for this employee and date range.
          </div>
        )}
        {!auditLoading && !auditError && auditRecords.length > 0 && (
          <>
            <div className="table-wrap employee-audit-table-wrap">
              <table className="employee-audit-table">
                <thead>
                  <tr>
                    <th>ATTENDANCE DATE</th>
                    <th>PREVIOUS STATUS</th>
                    <th>NEW STATUS</th>
                    <th>CORRECTED BY</th>
                    <th>CORRECTED AT</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <time dateTime={record.date}>
                          {record.date || "Not recorded"}
                        </time>
                      </td>
                      <td>{record.previousStatus || "Not recorded"}</td>
                      <td>{record.newStatus || "Not recorded"}</td>
                      <td>{record.changedBy || "Not recorded"}</td>
                      <td>{formatAttendanceTimestamp(record.changedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditMoreError && (
              <div
                className="employee-load-error employee-load-error-banner"
                role="alert"
              >
                <span>{auditMoreError}</span>
              </div>
            )}
            {auditHasMore && (
              <div className="employee-audit-pagination">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={loadMoreAudit}
                  disabled={auditLoadingMore}
                >
                  {auditLoadingMore
                    ? "Loading…"
                    : auditMoreError
                      ? "Retry loading more"
                      : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Employees({
  employees,
  search,
  setSearch,
  onAdd,
  onEdit,
  onDelete,
  onImport,
  onDownloadTemplate,
  templateLoading,
  isAdmin,
  isSuperAdmin,
  activeGodown,
  loading,
  error,
  onRetry,
}) {
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const filtered = employees.filter(
    (e) => statusFilter === "All statuses" || e.status === statusFilter,
  );
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE DIRECTORY"
        title="Employee register"
        subtitle="Maintain employee details and work assignments."
        action={
          isAdmin && (
            <div className="employee-page-actions">
              <button className="btn btn-secondary" onClick={onImport}>
                <Upload size={16} /> Import employees
              </button>
              <button className="btn btn-primary" onClick={onAdd}>
                <Plus size={16} /> Add employee
              </button>
            </div>
          )
        }
      />
      <div className="filter-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="Search employee name or job role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="select-filter">
          <Filter size={15} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All statuses</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </label>
        <div className="filter-context">
          <Warehouse size={15} />
          {activeGodown}
        </div>
      </div>
      <div className="panel table-panel">
        <div className="table-topline">
          <div>
            <strong>{filtered.length} employees</strong>
            <span> · {activeGodown}</span>
          </div>
          {isAdmin && (
            <button
              className="btn btn-secondary btn-small"
              onClick={onDownloadTemplate}
              disabled={templateLoading}
            >
              <Download size={17} />
              {templateLoading ? "Preparing template..." : "Download template"}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>JOB ROLE</th>
                <th>ASSIGNMENT</th>
                <th>STATUS</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 4}
                    className="empty-state"
                    role="status"
                  >
                    Loading employee records...
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    <div className="employee-load-error" role="alert">
                      <span>{error}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={onRetry}
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar small">{initials(e.name)}</div>
                        <div>
                          <Link
                            className="employee-name-link"
                            to={`/employees/${encodeURIComponent(String(e.id))}`}
                          >
                            {e.name}
                          </Link>
                          <span>EMP-{String(e.id).padStart(4, "0")}</span>
                        </div>
                      </div>
                    </td>
                    <td>{e.displayRole || e.role}</td>
                    <td>{e.displayAssignment}</td>
                    <td>
                      <span className="status-badge active-status">
                        {e.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="icon-button row-action"
                          onClick={() => onEdit(e)}
                          title="Edit employee"
                        >
                          <Pencil size={16} />
                        </button>
                        {isSuperAdmin && (
                          <button
                            className="icon-button row-action"
                            onClick={() => onDelete(e)}
                            title={`Delete ${e.name}`}
                            aria-label={`Delete ${e.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    No employees match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {filtered.length} of {employees.length} employees in this
            view
          </span>
          <span>Firestore records</span>
        </div>
      </div>
    </>
  );
}

function Attendance({
  rows,
  date,
  setDate,
  onMark,
  isAdmin,
  activeGodown,
  loading,
  hasCurrentData,
  saving,
  error,
  onRetry,
}) {
  const location = useLocation();
  const [filter, setFilter] = useState(
    location.state?.status || "All statuses",
  );
  const filtered = rows.filter((r) =>
    filter === "All statuses" ? true : r.attendance === filter,
  );
  const summary = (s) => rows.filter((r) => r.attendance === s).length;
  const quickFilters = ["All statuses", ...statuses, "Not marked"];
  const marked = rows.filter((row) => row.attendance !== "Not marked").length;
  const completionPercent = rows.length
    ? Math.round((marked / rows.length) * 100)
    : 0;
  return (
    <>
      <PageHeading
        eyebrow="DAILY RECORD"
        title="Daily attendance"
        subtitle="Mark attendance and correct saved entries for the selected date."
      />
      {loading && (
        <div
          className="data-refresh-indicator"
          role="status"
          aria-live="polite"
        >
          Updating attendance for {date}…
        </div>
      )}
      {error && (
        <div
          className="employee-load-error employee-load-error-banner"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}
      <div className="attendance-controls">
        <label className="date-input">
          <CalendarDays size={16} />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => setDate(getLocalDateString())}
        >
          Today
        </button>
        <div className="filter-context">
          <Warehouse size={15} />
          {activeGodown}
        </div>
        <div className="control-spacer" />
      </div>
      <div
        className="mini-stats"
        role="group"
        aria-label="Filter by attendance status"
      >
        {quickFilters.map((status) => (
          <button
            type="button"
            className={`mini-stat${filter === status ? " active" : ""}`}
            key={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status !== "All statuses" && (
              <span
                className={`mini-dot ${status.toLowerCase().replace(" ", "-")}`}
              />
            )}
            <span>{status}</span>
            <strong>
              {hasCurrentData
                ? status === "All statuses"
                  ? rows.length
                  : summary(status)
                : "…"}
            </strong>
          </button>
        ))}
      </div>
      <section className="panel attendance-completion">
        <div className="panel-heading">
          <div>
            <h2>Attendance completion</h2>
            <p>How many employees have an attendance entry for {date}</p>
          </div>
        </div>
        <div className="completion-row">
          <div className="completion-number">
            {hasCurrentData ? marked : "…"}
            <span> / {rows.length} marked</span>
          </div>
          <span className="completion-percent">
            {hasCurrentData ? `${completionPercent}% complete` : "Updating"}
          </span>
        </div>
        <div className="progress-track">
          <div
            style={{
              width: `${hasCurrentData ? completionPercent : 0}%`,
            }}
          />
        </div>
      </section>
      <div className="panel table-panel">
        <div className="table-topline">
          <div>
            <strong>{hasCurrentData ? filtered.length : "—"} employees</strong>
            <span> · {date}</span>
          </div>
          <span className="muted-small">
            Select a status to mark or correct
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>ROLE</th>
                {isAdmin && <th>ASSIGNMENT</th>}
                <th>ATTENDANCE STATUS</th>
                <th>LAST UPDATED</th>
              </tr>
            </thead>
            <tbody>
              {loading && !hasCurrentData && !error && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    Loading attendance for {date}...
                  </td>
                </tr>
              )}
              {error && !hasCurrentData && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    Attendance could not be loaded.
                  </td>
                </tr>
              )}
              {hasCurrentData &&
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar small">{initials(e.name)}</div>
                        <div>
                          <Link
                            className="employee-name-link"
                            to={`/employees/${encodeURIComponent(String(e.id))}`}
                          >
                            {e.name}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td>{e.displayRole || e.role}</td>
                    {isAdmin && <td>{e.displayAssignment}</td>}
                    <td>
                      <select
                        className={`attendance-select ${statusClass(e.attendance)}`}
                        value={e.attendance}
                        disabled={
                          loading ||
                          saving ||
                          Boolean(error) ||
                          (e.status !== "Active" &&
                            e.attendance === "Not marked")
                        }
                        title={
                          e.status !== "Active" && e.attendance === "Not marked"
                            ? "Inactive employees cannot receive new attendance records."
                            : undefined
                        }
                        onChange={(ev) => onMark(e.id, ev.target.value)}
                      >
                        <option disabled>Not marked</option>
                        {statuses.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="muted-small">
                        {e.attendanceRecord
                          ? `${formatAttendanceTimestamp(e.attendanceRecord.updatedAt)} · ${e.attendanceRecord.updatedBy || "User"}`
                          : "Not marked"}
                      </span>
                    </td>
                  </tr>
                ))}
              {hasCurrentData &&
                !loading &&
                !error &&
                filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                      No attendance entries for this filter.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
        <div className="audit-note">
          <History size={16} />
          <span>
            Corrections update the attendance record and append the previous
            status, new status, editor and timestamp to the audit history.
          </span>
        </div>
      </div>
    </>
  );
}

function CalendarPage({
  attendance,
  employees,
  selectedDate,
  setSelectedDate,
  navigate,
  month,
  setMonth,
  loading,
  error,
  onRetry,
}) {
  const year = month.getFullYear(),
    m = month.getMonth();
  const first = new Date(year, m, 1).getDay();
  const days = new Date(year, m + 1, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const visibleAttendance = attendance;
  const activeEmployeeIds = new Set(
    employees
      .filter((employee) => employee.status === "Active")
      .map((employee) => String(employee.id)),
  );
  const markedEmployeesByDate = new Map();
  for (const record of visibleAttendance) {
    const employeeId = String(record.employeeId);
    if (
      !activeEmployeeIds.has(employeeId) ||
      !statuses.includes(record.status)
    ) {
      continue;
    }
    if (!markedEmployeesByDate.has(record.date)) {
      markedEmployeesByDate.set(record.date, new Set());
    }
    markedEmployeesByDate.get(record.date).add(employeeId);
  }
  const completionFor = (day) => {
    if (!day) return "";
    const date = `${year}-${fmt(m + 1)}-${fmt(day)}`;
    const markedCount = markedEmployeesByDate.get(date)?.size || 0;
    if (!markedCount) return "";
    return markedCount >= activeEmployeeIds.size
      ? "fully-marked"
      : "partially-marked";
  };
  const selectedRows = visibleAttendance.filter(
    (a) =>
      a.date === selectedDate &&
      employees.some((e) => String(e.id) === String(a.employeeId)),
  );
  return (
    <>
      <PageHeading
        eyebrow="DATE FILTERS"
        title="Attendance calendar"
        subtitle="Choose a day to review or update attendance. Select a date to open its daily register."
      />
      {loading && (
        <div
          className="data-refresh-indicator"
          role="status"
          aria-live="polite"
        >
          Updating calendar attendance…
        </div>
      )}
      {error && (
        <div
          className="employee-load-error employee-load-error-banner"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-head">
            <button
              className="icon-button"
              onClick={() => setMonth(new Date(year, m - 1, 1))}
            >
              <ChevronRight className="flip" size={18} />
            </button>
            <h2>
              {month.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              className="icon-button"
              onClick={() => setMonth(new Date(year, m + 1, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-grid weekday-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((day, i) => {
              const date = day ? `${year}-${fmt(m + 1)}-${fmt(day)}` : "";
              const completion = completionFor(day);
              return (
                <button
                  key={i}
                  disabled={!day}
                  className={`calendar-day ${completion} ${date === selectedDate ? "chosen" : ""} ${date === today ? "today" : ""}`}
                  onClick={() => day && setSelectedDate(date)}
                >
                  <span>{day}</span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i className="dot blue-dot" />
              Selected date
            </span>
            <span>
              <i className="calendar-legend-dot partial-dot" />
              Partially marked
            </span>
            <span>
              <i className="calendar-legend-dot full-dot" />
              Fully marked
            </span>
          </div>
        </section>
        <section className="panel selected-day-panel">
          <div className="eyebrow">SELECTED DATE</div>
          <h2>
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h2>
          <div className="selected-count">
            <strong>{loading ? "..." : selectedRows.length}</strong>
            <span>attendance entries</span>
          </div>
          <div className="selected-status-list">
            {statuses.map((s) => (
              <div key={s}>
                <span
                  className={`mini-dot ${s.toLowerCase().replace(" ", "-")}`}
                />
                {s}
                <strong>
                  {selectedRows.filter((a) => a.status === s).length}
                </strong>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary full-width"
            onClick={() => navigate("/attendance")}
          >
            Open daily attendance <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <div className="calendar-tip">
        <CalendarDays size={17} />
        <span>
          Calendar indicators reflect saved attendance records in your permitted
          godown scope.
        </span>
      </div>
    </>
  );
}

function Reports({
  employees,
  attendance,
  activeGodown,
  from,
  to,
  previousFrom,
  previousTo,
  setFrom,
  setTo,
  loading,
  resultsAreStale,
  hasMore,
  error,
  onRetry,
  onLoadMore,
  onDownload,
  exporting,
}) {
  const rows = resultsAreStale
    ? []
    : attendance.filter(
        (a) => a.date >= from && a.date <= to && statuses.includes(a.status),
      );
  return (
    <>
      <PageHeading
        eyebrow="ATTENDANCE INSIGHTS"
        title="Reports"
        subtitle="Review attendance records over a selected period."
        action={
          <div className="employee-page-actions">
            <button
              className="btn btn-primary"
              onClick={onDownload}
              disabled={
                exporting ||
                loading ||
                resultsAreStale ||
                Boolean(error) ||
                !isAttendanceDate(from) ||
                !isAttendanceDate(to) ||
                from > to
              }
            >
              <Download size={16} />
              {exporting ? "Preparing Excel..." : "Download Excel"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
            >
              <Download size={16} /> Print report
            </button>
          </div>
        }
      />
      {error && (
        <div
          className="employee-load-error employee-load-error-banner"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}
      <div className="panel report-filter">
        <div>
          <strong>Report period</strong>
          <span>Choose a date range for the summary</span>
        </div>
        <div className="range-fields">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="stats-grid report-stats">
        {statuses.map((s) => (
          <StatCard
            key={s}
            label={s}
            value={
              error
                ? "—"
                : loading || resultsAreStale
                  ? "…"
                  : rows.filter((a) => a.status === s).length
            }
            note="Loaded records in selected period"
            icon={<ClipboardCheck size={18} />}
            tone={statusTone(s)}
          />
        ))}
      </div>
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Attendance entries</h2>
            <p>
              {activeGodown} · {from} to {to}
            </p>
          </div>
          <span className="status-badge">
            {loading || resultsAreStale ? "Updating" : `${rows.length} loaded`}
          </span>
        </div>
        {resultsAreStale && (
          <div
            className="data-refresh-indicator report-refresh"
            role="status"
            aria-live="polite"
          >
            {loading
              ? `Loading attendance from ${from} to ${to}. Previous results are hidden until this range is ready.`
              : `The selected range could not be loaded. Previous results from ${previousFrom} to ${previousTo} are hidden.`}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DATE</th>
                <th>EMPLOYEE</th>
                <th>ASSIGNMENT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const employee = employees.find(
                  (item) => String(item.id) === String(a.employeeId),
                );
                return (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>
                      {a.employeeId ? (
                        <Link
                          className="employee-name-link"
                          to={`/employees/${encodeURIComponent(String(a.employeeId))}`}
                        >
                          {a.employeeName ||
                            employee?.name ||
                            "Unknown employee"}
                        </Link>
                      ) : (
                        <strong>
                          {a.employeeName ||
                            employee?.name ||
                            "Unknown employee"}
                        </strong>
                      )}
                    </td>
                    <td>
                      {a.godown ||
                        a.departmentName ||
                        employee?.godown ||
                        employee?.department ||
                        "Unknown assignment"}
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    Loading attendance history...
                  </td>
                </tr>
              )}
              {!loading && !error && !rows.length && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No entries in this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="registration-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function UsersPage({
  accounts,
  catalogs,
  catalogStored,
  currentUserId,
  loading,
  error,
  updatingAccountId,
  onRetry,
  onUpdate,
  onCreate,
}) {
  return (
    <>
      <PageHeading
        eyebrow="ACCESS CONTROL"
        title="User management"
        subtitle="Manage account roles, godown assignments, and access."
        action={
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={16} /> Create account
          </button>
        }
      />
      <div className="notice-strip">
        <div className="notice-symbol">
          <LockKeyhole size={17} />
        </div>
        <div>
          <strong>SuperAdmin account management</strong>
          <span>
            Staff accounts are limited to one assigned godown. Your own role
            cannot be changed, and the last active Admin cannot be demoted or
            deactivated here.
          </span>
        </div>
      </div>
      {error && (
        <div
          className="employee-load-error employee-load-error-banner"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>USER</th>
                <th>ACCOUNT ROLE</th>
                <th>ASSIGNED GODOWN</th>
                <th>STATUS</th>
                <th>ACCESS</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="5" className="empty-state">
                    Loading user profiles...
                  </td>
                </tr>
              )}
              {accounts.map((account) => (
                <UserAccountRow
                  key={account.id}
                  account={account}
                  catalogs={catalogs}
                  catalogStored={catalogStored}
                  currentUserId={currentUserId}
                  disabled={Boolean(updatingAccountId)}
                  onUpdate={onUpdate}
                />
              ))}
              {!loading && !error && !accounts.length && (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No user profiles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function UserAccountRow({
  account,
  catalogs,
  catalogStored,
  currentUserId,
  disabled,
  onUpdate,
}) {
  const [pendingRole, setPendingRole] = useState(null);
  const role = pendingRole || account.role;
  const canEditRole = account.id !== currentUserId;
  const legacyGodown = !account.godownId
    ? findCatalogEntryByName(catalogs.godowns, account.godown)
    : null;

  useEffect(() => {
    setPendingRole(null);
  }, [account.role, account.godown, account.godownId]);

  const selectRole = (nextRole) => {
    if (nextRole === account.role) {
      setPendingRole(null);
      return;
    }
    if (nextRole === "Staff" && account.role === "Admin") {
      setPendingRole("Staff");
      return;
    }
    void onUpdate(account.id, {
      role: nextRole,
      ...(nextRole === "Admin"
        ? { godown: null, godownId: null }
        : {
            godown: account.godown,
            godownId: account.godownId,
          }),
    });
  };

  const selectGodown = async (nextGodownId) => {
    const entry = catalogEntries(catalogs.godowns).find(
      (godown) => godown.id === nextGodownId,
    );
    if (!entry) return;
    const changes =
      pendingRole === "Staff"
        ? { role: "Staff", godown: entry.name, godownId: entry.id }
        : { godown: entry.name, godownId: entry.id };
    const updated = await onUpdate(account.id, changes);
    if (updated && pendingRole) setPendingRole(null);
  };

  return (
    <tr>
      <td>
        <div className="employee-cell">
          <div className="avatar small">
            {initials(account.name || account.email)}
          </div>
          <div>
            <strong>{account.name || "User account"}</strong>
            <span>{account.email}</span>
          </div>
        </div>
      </td>
      <td>
        {SUPER_ADMIN_UIDS.includes(account.id) ? (
          <span className="role-badge admin-role">{account.role}</span>
        ) : (
          <select
            className="staff-godown-select"
            aria-label={`Account role for ${account.email}`}
            value={role}
            disabled={disabled || !canEditRole}
            onChange={(event) => selectRole(event.target.value)}
          >
            <option value="Staff">Staff</option>
            <option value="Admin">Admin</option>
          </select>
        )}
      </td>
      <td>
        {SUPER_ADMIN_UIDS.includes(account.id) ? (
          <span className="muted-small">All godowns</span>
        ) : role === "Staff" ? (
          <>
            <select
              className="staff-godown-select"
              aria-label={`Assigned godown for ${account.email}`}
              value={
                pendingRole === "Staff"
                  ? ""
                  : account.godownId || legacyGodown?.id || ""
              }
              required
              disabled={disabled}
              onChange={(event) => void selectGodown(event.target.value)}
            >
              <option value="">Select a godown</option>
              {catalogEntries(catalogs.godowns, { includeArchived: true })
                .filter(
                  (entry) => entry.active || entry.id === account.godownId,
                )
                .map(({ id, name, active }) => (
                  <option key={id} value={id}>
                    {active ? name : `${name} (archived)`}
                  </option>
                ))}
            </select>
            {!pendingRole && catalogStored && legacyGodown?.active && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={disabled}
                onClick={() => void selectGodown(legacyGodown.id)}
              >
                Save assignment
              </button>
            )}
          </>
        ) : (
          <span className="muted-small">All godowns</span>
        )}
      </td>
      <td>
        <span
          className={`status-badge ${account.active ? "active-status" : "inactive-status"}`}
        >
          {account.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={
            disabled ||
            account.id === currentUserId ||
            SUPER_ADMIN_UIDS.includes(account.id)
          }
          onClick={() => void onUpdate(account.id, { active: !account.active })}
        >
          {account.active ? "Deactivate" : "Activate"}
        </button>
      </td>
    </tr>
  );
}

function SettingsPage({
  isAdmin,
  isSuperAdmin,
  activeGodown,
  catalogs,
  catalogStored,
  loading,
  error,
  onRefresh,
  onSave,
}) {
  const [newNames, setNewNames] = useState({});
  const [editedNames, setEditedNames] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const categories = [
    { key: "godowns", label: "Godowns" },
    { key: "jobRoles", label: "Employee job roles" },
    { key: "departments", label: "Departments" },
  ];

  const saveEntry = async (category, id, update) => {
    const current = catalogs[category][id];
    const nextEntry = { ...current, ...update };
    if (update.name && update.name !== current.name) {
      nextEntry.legacyAliases = [
        ...new Set([...(current.legacyAliases || []), current.name]),
      ];
    }
    const proposedName = nextEntry.name.trim().toLocaleLowerCase();
    const duplicateName = catalogEntries(catalogs[category], {
      includeArchived: true,
    }).some(
      (entry) =>
        entry.id !== id &&
        [entry.name, ...(entry.legacyAliases || [])].some(
          (name) => name.trim().toLocaleLowerCase() === proposedName,
        ),
    );
    if (!nextEntry.name.trim() || duplicateName) {
      setCatalogError(
        "Enter a unique non-empty name within this configuration section.",
      );
      return;
    }
    setSavingKey(`${category}:${id}`);
    setCatalogError("");
    try {
      await onSave({
        ...catalogs,
        [category]: { ...catalogs[category], [id]: nextEntry },
      });
      setEditedNames((previous) => {
        const next = { ...previous };
        delete next[`${category}:${id}`];
        return next;
      });
    } catch (saveError) {
      setCatalogError(saveError.message || "Could not save this entry.");
    } finally {
      setSavingKey("");
    }
  };

  const addEntry = async (category) => {
    const name = (newNames[category] || "").trim();
    const proposedName = name.toLocaleLowerCase();
    const duplicateName = catalogEntries(catalogs[category], {
      includeArchived: true,
    }).some((entry) =>
      [entry.name, ...(entry.legacyAliases || [])].some(
        (existingName) =>
          existingName.trim().toLocaleLowerCase() === proposedName,
      ),
    );
    if (!name || duplicateName) {
      setCatalogError(
        "Enter a unique non-empty name within this configuration section.",
      );
      return;
    }
    let id = createCatalogId(name);
    while (Object.hasOwn(catalogs[category], id)) {
      id = createCatalogId(name);
    }
    setSavingKey(`${category}:new`);
    setCatalogError("");
    try {
      await onSave({
        ...catalogs,
        [category]: {
          ...catalogs[category],
          [id]: { name, active: true },
        },
      });
      setNewNames((previous) => ({ ...previous, [category]: "" }));
    } catch (saveError) {
      setCatalogError(saveError.message || "Could not add this entry.");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE PREFERENCES"
        title="Settings"
        subtitle="Manage the organisational options used throughout PeopleHub."
        action={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />
      <div className="settings-grid">
        <div className="panel settings-card">
          <div className="settings-icon">
            <Building2 size={19} />
          </div>
          <h3>Company workspace</h3>
          <p>PeopleHub employee register and attendance support tool.</p>
          <span className="settings-meta">
            {catalogEntries(catalogs.godowns).length} active godowns
          </span>
        </div>
        <div className="panel settings-card">
          <div className="settings-icon">
            <ShieldCheck size={19} />
          </div>
          <h3>Account access</h3>
          <p>
            {isAdmin
              ? `You are signed in as ${isSuperAdmin ? "SuperAdmin" : "Admin"}.`
              : `Your Staff account is assigned to ${activeGodown}.`}
          </p>
          <span className="settings-meta">
            {isSuperAdmin
              ? "SuperAdmin · all godowns"
              : isAdmin
                ? "Admin · all godowns"
                : `Staff · ${activeGodown}`}
          </span>
        </div>
        <div className="panel settings-card">
          <div className="settings-icon">
            <History size={19} />
          </div>
          <h3>Attendance history</h3>
          <p>Corrections will preserve who changed a record and when.</p>
          <span className="settings-meta">
            Attendance corrections retain their original snapshots.
          </span>
        </div>
      </div>
      {(error || catalogError) && (
        <div className="auth-feedback error" role="alert">
          {catalogError || error}
        </div>
      )}
      {!isSuperAdmin ? (
        <div className="panel settings-card">
          <h3>Organisational configuration</h3>
          <p>Only the protected SuperAdmin can manage catalogue entries.</p>
        </div>
      ) : (
        <div className="catalog-management">
          {!catalogStored && (
            <p className="field-hint">
              Built-in defaults are active. Your first catalogue change saves
              them to Firestore together with that change.
            </p>
          )}
          {categories.map(({ key, label }) => (
            <section className="panel catalog-section" key={key}>
              <div className="section-head">
                <h2>{label}</h2>
                <span className="count-pill">
                  {
                    catalogEntries(catalogs[key], { includeArchived: true })
                      .length
                  }
                </span>
              </div>
              <form
                className="catalog-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addEntry(key);
                }}
              >
                <input
                  aria-label={`New ${label.toLocaleLowerCase()} name`}
                  value={newNames[key] || ""}
                  onChange={(event) =>
                    setNewNames((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                  placeholder={`Add ${label.toLocaleLowerCase()}`}
                  maxLength={100}
                />
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={Boolean(savingKey) || loading}
                >
                  <Plus size={16} /> Add
                </button>
              </form>
              <div className="catalog-entry-list">
                {catalogEntries(catalogs[key], { includeArchived: true }).map(
                  (entry) => {
                    const rowKey = `${key}:${entry.id}`;
                    const editedName = editedNames[rowKey] ?? entry.name;
                    const isSaving = savingKey === rowKey;
                    return (
                      <div className="catalog-entry" key={entry.id}>
                        <input
                          aria-label={`${label} name`}
                          value={editedName}
                          onChange={(event) =>
                            setEditedNames((previous) => ({
                              ...previous,
                              [rowKey]: event.target.value,
                            }))
                          }
                          maxLength={100}
                          disabled={Boolean(savingKey) || loading}
                        />
                        <span
                          className={`status-badge ${entry.active ? "active-status" : "inactive-status"}`}
                        >
                          {entry.active ? "Active" : "Archived"}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={
                            Boolean(savingKey) ||
                            loading ||
                            editedName.trim() === entry.name
                          }
                          onClick={() =>
                            void saveEntry(key, entry.id, {
                              name: editedName.trim(),
                            })
                          }
                        >
                          Save name
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={Boolean(savingKey) || loading}
                          onClick={() =>
                            void saveEntry(key, entry.id, {
                              active: !entry.active,
                            })
                          }
                        >
                          {entry.active ? "Archive" : "Restore"}
                        </button>
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          ))}
          <p className="field-hint">
            Archive entries that are still referenced by employees, accounts,
            attendance, or audit history. Archived entries are hidden from new
            assignments but remain available to existing records.
          </p>
        </div>
      )}
    </>
  );
}

function EmployeeImportModal({ onClose, onGetEmployees, onSave, catalogs }) {
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const previewLimit = 100;
  const { validRows, duplicateCount, validationFailureCount } = useMemo(() => {
    const counts = {
      validRows: [],
      duplicateCount: 0,
      validationFailureCount: 0,
    };
    for (const row of preview || []) {
      if (row.errors.length > 0) {
        counts.validationFailureCount += 1;
      } else if (row.duplicate) {
        counts.duplicateCount += 1;
      } else {
        counts.validRows.push(row);
      }
    }
    return counts;
  }, [preview]);
  const busy = processing || saving;

  const parseFile = async (selectedFile) => {
    const existingEmployees = await onGetEmployees();
    const fileBuffer = await selectedFile.arrayBuffer();
    const rows = await runEmployeeWorkbookWorker(
      { type: "parse", fileBuffer, existingEmployees, catalogs },
      [fileBuffer],
    );
    setPreview(rows);
    return rows;
  };

  const chooseFile = async (event) => {
    const selectedFile = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selectedFile) return;
    setFile(selectedFile);
    setPreview(null);
    setResult(null);
    setError("");
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setError("Unsupported file. Choose an Excel .xlsx workbook.");
      return;
    }

    setProcessing(true);
    try {
      await parseFile(selectedFile);
    } catch (parseError) {
      setError(parseError.message || "Could not read this Excel workbook.");
    } finally {
      setProcessing(false);
    }
  };

  const save = async () => {
    if (!file || busy || result?.complete || validRows.length === 0) return;
    setSaving(true);
    setError("");
    setResult(null);
    let currentCounts = { duplicateCount, validationFailureCount };
    let currentEligibleCount = validRows.length;
    try {
      const rows = await parseFile(file);
      const eligibleRows = rows.filter(
        (row) => row.errors.length === 0 && !row.duplicate,
      );
      currentEligibleCount = eligibleRows.length;
      currentCounts = rows.reduce(
        (counts, row) => {
          if (row.errors.length > 0) {
            counts.validationFailureCount += 1;
          } else if (row.duplicate) {
            counts.duplicateCount += 1;
          }
          return counts;
        },
        { duplicateCount: 0, validationFailureCount: 0 },
      );
      if (eligibleRows.length === 0) {
        setResult({
          importedCount: 0,
          eligibleCount: 0,
          complete: true,
          ...currentCounts,
        });
        return;
      }
      const importedCount = await onSave(
        eligibleRows.map((row) => row.employee),
      );
      if (importedCount > 0) {
        setFile(null);
        setPreview(null);
        setResult(null);
        setError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setResult({
          importedCount,
          eligibleCount: eligibleRows.length,
          complete: true,
          ...currentCounts,
        });
      }
    } catch (saveError) {
      setError(saveError.message || "Could not complete the employee import.");
      setResult({
        importedCount: Number(saveError.importedCount) || 0,
        eligibleCount: currentEligibleCount,
        complete: false,
        ...currentCounts,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        !busy && event.target === event.currentTarget && onClose()
      }
    >
      <section
        className="modal employee-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-import-title"
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">EMPLOYEE REGISTER</div>
            <h2 id="employee-import-title">Import employees</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close employee import"
          >
            <X size={19} />
          </button>
        </div>
        <div className="modal-body employee-import-body">
          <label>
            Excel workbook (.xlsx)
            <input
              ref={fileInputRef}
              className="employee-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={chooseFile}
              disabled={busy}
            />
            <span className="field-hint">
              Use Name, or First Name and Second Name with an optional Third
              Name, plus Role, Godown, Department, and Status. Populate exactly
              one of Godown or Department for each employee.
            </span>
          </label>
          {file && <div className="employee-import-filename">{file.name}</div>}
          {processing && (
            <div className="employee-import-message" role="status">
              Reading and validating workbook...
            </div>
          )}
          {error && (
            <div className="auth-feedback error" role="alert">
              {error}
            </div>
          )}
          {preview && (
            <>
              <div className="employee-import-counts" aria-live="polite">
                <span>
                  <strong>{validRows.length}</strong> ready to import
                </span>
                <span>
                  <strong>{duplicateCount}</strong> duplicates to skip
                </span>
                <span>
                  <strong>{validationFailureCount}</strong> validation failures
                </span>
              </div>
              {preview.length === 0 ? (
                <div className="employee-import-message">
                  No employee rows were found below the column headings.
                </div>
              ) : (
                <>
                  {result?.complete && (
                    <div className="employee-import-result" role="status">
                      <strong>
                        Successfully imported {result.importedCount}{" "}
                        {result.importedCount === 1 ? "employee" : "employees"}.
                      </strong>{" "}
                      Skipped {result.duplicateCount ?? duplicateCount}{" "}
                      duplicates.{" "}
                      {result.validationFailureCount ?? validationFailureCount}{" "}
                      rows had validation failures.
                    </div>
                  )}
                  {result && !result.complete && (
                    <div className="employee-import-result" role="status">
                      <strong>
                        Successfully imported {result.importedCount}{" "}
                        {result.importedCount === 1 ? "employee" : "employees"}.
                      </strong>{" "}
                      {Math.max(result.eligibleCount - result.importedCount, 0)}{" "}
                      eligible{" "}
                      {result.eligibleCount - result.importedCount === 1
                        ? "employee was"
                        : "employees were"}{" "}
                      not imported because saving stopped.{" "}
                      {result.duplicateCount ?? duplicateCount} duplicates were
                      skipped and{" "}
                      {result.validationFailureCount ?? validationFailureCount}{" "}
                      rows had validation failures.
                    </div>
                  )}
                  <div className="employee-import-preview-wrap">
                    <table className="employee-import-preview">
                      <thead>
                        <tr>
                          <th>ROW</th>
                          <th>NAME</th>
                          <th>ROLE</th>
                          <th>ASSIGNMENT</th>
                          <th>STATUS</th>
                          <th>CHECK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, previewLimit).map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>{row.employee.name || "—"}</td>
                            <td>{row.employee.role}</td>
                            <td>{row.employee.assignment || "—"}</td>
                            <td>{row.employee.status}</td>
                            <td>
                              {row.errors.length > 0 ? (
                                <span className="employee-import-error">
                                  {row.errors.join(" ")}
                                </span>
                              ) : row.duplicate === "existing" ? (
                                <span className="employee-import-warning">
                                  Existing employee name; skipped.
                                </span>
                              ) : row.duplicate === "upload" ? (
                                <span className="employee-import-warning">
                                  Duplicate name in this file; later row
                                  skipped.
                                </span>
                              ) : (
                                <span className="employee-import-ready">
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.length > previewLimit && (
                    <div className="field-hint">
                      Showing the first {previewLimit} of {preview.length} rows.
                      All rows are validated.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || result?.complete || validRows.length === 0}
          >
            {saving
              ? "Importing..."
              : result && !result.complete
                ? `Retry import (${validRows.length})`
                : `Import ${validRows.length} employees`}
          </button>
        </div>
      </section>
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSave, defaultGodown, catalogs }) {
  const activeJobRoles = catalogEntries(catalogs.jobRoles);
  const defaultJobRole =
    activeJobRoles.find((entry) => entry.id === "loader") || activeJobRoles[0];
  const initialAssignmentType =
    employee?.departmentId && !employee?.godown ? "department" : "godown";
  const assignmentCatalog =
    initialAssignmentType === "department"
      ? catalogs.departments
      : catalogs.godowns;
  const existingAssignmentName =
    initialAssignmentType === "department"
      ? employee?.department
      : employee?.godown;
  const initialAssignment =
    catalogEntries(assignmentCatalog, { includeArchived: true }).find(
      (entry) =>
        entry.id ===
        (initialAssignmentType === "department"
          ? employee?.departmentId
          : employee?.godownId),
    ) ||
    findCatalogEntryByName(assignmentCatalog, existingAssignmentName) ||
    (initialAssignmentType === "godown"
      ? findCatalogEntryByName(catalogs.godowns, defaultGodown)
      : null);
  const [form, setForm] = useState(
    employee
      ? {
          name: employee.name || "",
          role: employee.role || "",
          jobRoleId: employee.jobRoleId || "",
          status: employee.status || "Active",
        }
      : {
          name: "",
          role: defaultJobRole?.name || "",
          jobRoleId: defaultJobRole?.id || "",
          status: "Active",
        },
  );
  const [assignmentType, setAssignmentType] = useState(initialAssignmentType);
  const [assignmentId, setAssignmentId] = useState(initialAssignment?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const activeAssignments = catalogEntries(
    catalogs[assignmentType === "department" ? "departments" : "godowns"],
  );
  const selectedArchivedAssignment = catalogEntries(
    catalogs[assignmentType === "department" ? "departments" : "godowns"],
    { includeArchived: true },
  ).find((entry) => entry.id === assignmentId && !entry.active);
  const assignmentOptions = [
    ...activeAssignments,
    ...(selectedArchivedAssignment ? [selectedArchivedAssignment] : []),
  ];
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, assignmentType, assignmentId });
    } catch (saveError) {
      setError(saveError.message || "Could not save this employee.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">
              {employee ? "EDIT RECORD" : "NEW EMPLOYEE"}
            </div>
            <h2>{employee ? "Edit employee" : "Add employee"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            Full name
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Enter employee full name"
            />
          </label>
          <label>
            Job role
            <select
              required
              value={form.role}
              onChange={(event) => {
                const selectedRole = activeJobRoles.find(
                  (entry) => entry.name === event.target.value,
                );
                setForm((previous) => ({
                  ...previous,
                  role: event.target.value,
                  jobRoleId: selectedRole?.id || "",
                }));
              }}
            >
              {[
                ...activeJobRoles.map((entry) => entry.name),
                ...(form.role &&
                !activeJobRoles.some((entry) => entry.name === form.role)
                  ? [form.role]
                  : []),
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Assignment type
            <select
              value={assignmentType}
              onChange={(event) => {
                const nextType = event.target.value;
                const nextEntries = catalogEntries(
                  catalogs[
                    nextType === "department" ? "departments" : "godowns"
                  ],
                );
                setAssignmentType(nextType);
                setAssignmentId(nextEntries[0]?.id || "");
              }}
            >
              <option value="godown">Godown</option>
              <option value="department">Department</option>
            </select>
          </label>
          <label>
            {assignmentType === "department" ? "Department" : "Godown"}
            <select
              required
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
            >
              <option value="">Select an active {assignmentType}</option>
              {assignmentOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.active ? "" : " (archived; retained)"}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Assign an employee to exactly one godown or department.
            </span>
          </label>
          <label>
            Employment status
            <select
              required
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
          {error && (
            <div className="auth-feedback error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : "Save employee"}
          </button>
        </div>
      </form>
    </div>
  );
}

function initials(name = "") {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getLocalDateString(date = new Date()) {
  return formatLocalDate(date);
}

function localDateBoundary(date, addDays = 0) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day + addDays);
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${fmt(date.getMonth() + 1)}-${fmt(date.getDate())}`;
}

function formatEmployeeRegistrationDate(value) {
  const date =
    value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function attendanceDocumentId(employeeId, date) {
  return `${encodeURIComponent(employeeId)}_${date}`;
}

function isAttendanceDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsedDate = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
  );
}

function attendanceLoadErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Firestore denied attendance access. Verify that the deployed rules allow this role to read attendance in the permitted godown scope.";
  }
  if (error?.code === "failed-precondition") {
    return "Firestore requires an index for this attendance query. Check the Firebase console for the index creation link.";
  }
  if (
    error?.code === "unavailable" ||
    error?.code === "network-request-failed"
  ) {
    return "Check your connection and retry loading attendance.";
  }
  return "Could not load attendance from Firestore. Please retry.";
}

function attendanceSaveErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Firestore denied this attendance change or audit entry. Verify the deployed attendance and append-only audit rules.";
  }
  if (error?.code === "failed-precondition") {
    return "Firestore requires an index for this attendance operation. Check the Firebase console for the index creation link.";
  }
  if (
    error?.code === "unavailable" ||
    error?.code === "network-request-failed"
  ) {
    return "Check your connection. The attendance change was not confirmed; retry before assuming it was saved.";
  }
  if (typeof error?.message === "string" && error.message) {
    return error.message;
  }
  return "Could not save attendance or its audit entry. Please retry.";
}

function formatAttendanceTimestamp(value) {
  const date =
    value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : null;
  if (date && !Number.isNaN(date.getTime())) {
    return date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return typeof value === "string" ? value : "Timestamp unavailable";
}

function authErrorMessage(error, action = "login") {
  if (action === "reset") {
    switch (error?.code) {
      case "auth/invalid-email":
        return "Enter a valid email address.";
      case "auth/too-many-requests":
        return "Too many requests. Wait a few minutes and try again.";
      case "auth/network-request-failed":
        return "Check your internet connection and try again.";
      case "auth/operation-not-allowed":
        return "Password reset is not enabled. Contact an administrator.";
      default:
        return "Could not send a password reset email. Please try again.";
    }
  }

  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect. Check your details and try again.";
    case "auth/user-disabled":
      return "This account is disabled. Contact an administrator.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Check your internet connection and try again.";
    case "auth/operation-not-allowed":
      return "Email and password sign-in is not enabled. Contact an administrator.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

function statusClass(s = "") {
  return s.toLowerCase().replace(" ", "-").replace("not-marked", "not-marked");
}
function statusTone(s) {
  return (
    { Present: "green", Absent: "red", Sick: "orange", "On Leave": "purple" }[
      s
    ] || "blue"
  );
}

export default App;
