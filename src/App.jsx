import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Routes,
  Route,
  useLocation,
  useNavigate,
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
  ArrowUpRight,
  Building2,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { godowns } from "./data";
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
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, staffAccountAuth } from "./firebase";

const fmt = (n) => String(n).padStart(2, "0");
const today = getLocalDateString();
const statuses = ["Present", "Absent", "Sick", "On Leave", "Overtime"];
const attendancePageSize = 50;
const titleMap = {
  "/": "Overview",
  "/employees": "Employee register",
  "/attendance": "Daily attendance",
  "/calendar": "Attendance calendar",
  "/reports": "Reports",
  "/users": "User management",
  "/users/new": "Create staff account",
  "/settings": "Settings",
};

function App() {
  const [userAccounts, setUserAccounts] = useState([]);
  const [staffAccountsLoading, setStaffAccountsLoading] = useState(false);
  const [staffAccountsError, setStaffAccountsError] = useState("");
  const [updatingStaffAccountId, setUpdatingStaffAccountId] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [activeGodown, setActiveGodown] = useState("All godowns");
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [reportAttendance, setReportAttendance] = useState([]);
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [reportAttendanceLoading, setReportAttendanceLoading] = useState(false);
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
  const location = useLocation();
  const navigate = useNavigate();
  const authCheckId = useRef(0);
  const employeeRequestId = useRef(0);
  const staffAccountsRequestId = useRef(0);
  const attendanceRequestId = useRef(0);
  const reportAttendanceRequestId = useRef(0);
  const reportAttendanceCursor = useRef(null);
  const dailyAttendanceRequestId = useRef(0);
  const isAdmin = currentUser?.role === "Admin";
  const scopedGodown = isAdmin ? activeGodown : currentUser?.godown;

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
      const employeeQuery =
        currentUser.role === "Admin"
          ? employeesCollection
          : query(
              employeesCollection,
              where("godown", "==", currentUser.godown),
            );
      const snapshot = await getDocs(employeeQuery);
      if (requestId !== employeeRequestId.current) return false;

      setEmployees(
        snapshot.docs.map((employeeDoc) => ({
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
    if (!currentUser || location.pathname !== "/calendar") {
      setAttendance([]);
      setAttendanceError("");
      setAttendanceLoading(false);
      return true;
    }

    setAttendanceLoading(true);
    setAttendanceError("");
    try {
      const monthStart = formatLocalDate(calendarMonth);
      const monthEnd = formatLocalDate(
        new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth() + 1,
          0,
        ),
      );
      const constraints = [
        where("date", ">=", monthStart),
        where("date", "<=", monthEnd),
        orderBy("date", "asc"),
      ];
      if (!(isAdmin && scopedGodown === "All godowns")) {
        constraints.unshift(where("godown", "==", scopedGodown));
      }
      const attendanceQuery = query(
        collection(db, "attendance"),
        ...constraints,
      );
      const snapshot = await getDocs(attendanceQuery);
      if (requestId !== attendanceRequestId.current) return false;

      setAttendance(
        snapshot.docs.map((attendanceDoc) => ({
          id: attendanceDoc.id,
          ...attendanceDoc.data(),
        })),
      );
      return true;
    } catch (error) {
      if (requestId === attendanceRequestId.current) {
        setAttendance([]);
        setAttendanceError(attendanceLoadErrorMessage(error));
      }
      console.error("Could not load attendance history from Firestore.", error);
      return false;
    } finally {
      if (requestId === attendanceRequestId.current) {
        setAttendanceLoading(false);
      }
    }
  }, [currentUser, isAdmin, scopedGodown, location.pathname, calendarMonth]);

  const loadReportAttendance = useCallback(
    async (append = false) => {
      const requestId = ++reportAttendanceRequestId.current;
      if (!currentUser || location.pathname !== "/reports") {
        setReportAttendance([]);
        setReportAttendanceError("");
        setReportAttendanceLoading(false);
        setReportHasMore(false);
        reportAttendanceCursor.current = null;
        return true;
      }
      if (
        !isAttendanceDate(reportFrom) ||
        !isAttendanceDate(reportTo) ||
        reportFrom > reportTo
      ) {
        setReportAttendance([]);
        setReportAttendanceError("Choose a valid report date range.");
        setReportAttendanceLoading(false);
        setReportHasMore(false);
        reportAttendanceCursor.current = null;
        return false;
      }

      setReportAttendanceLoading(true);
      setReportAttendanceError("");
      if (!append) {
        reportAttendanceCursor.current = null;
        setReportAttendance([]);
        setReportHasMore(false);
      }

      try {
        const constraints = [
          where("date", ">=", reportFrom),
          where("date", "<=", reportTo),
          orderBy("date", "desc"),
          limit(attendancePageSize),
        ];
        if (!(isAdmin && scopedGodown === "All godowns")) {
          constraints.unshift(where("godown", "==", scopedGodown));
        }
        if (append && reportAttendanceCursor.current) {
          constraints.push(startAfter(reportAttendanceCursor.current));
        }
        const snapshot = await getDocs(
          query(collection(db, "attendance"), ...constraints),
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
        setReportHasMore(snapshot.docs.length === attendancePageSize);
        return true;
      } catch (error) {
        if (requestId === reportAttendanceRequestId.current) {
          setReportAttendanceError(attendanceLoadErrorMessage(error));
        }
        console.error("Could not load attendance report from Firestore.", error);
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
      location.pathname,
      reportFrom,
      reportTo,
      scopedGodown,
    ],
  );

  const loadDailyAttendance = useCallback(async () => {
    const requestId = ++dailyAttendanceRequestId.current;
    if (!currentUser) {
      setDailyAttendance([]);
      setDailyAttendanceError("");
      setDailyAttendanceLoading(false);
      return true;
    }
    if (!isAttendanceDate(selectedDate)) {
      setDailyAttendance([]);
      setDailyAttendanceError("Choose a valid date to load attendance.");
      setDailyAttendanceLoading(false);
      return false;
    }

    setDailyAttendanceLoading(true);
    setDailyAttendanceError("");
    try {
      const constraints = [where("date", "==", selectedDate)];
      if (!(isAdmin && scopedGodown === "All godowns")) {
        constraints.push(where("godown", "==", scopedGodown));
      }
      const attendanceQuery = query(collection(db, "attendance"), ...constraints);
      const snapshot = await getDocs(attendanceQuery);
      if (requestId !== dailyAttendanceRequestId.current) return false;

      setDailyAttendance(
        snapshot.docs.map((attendanceDoc) => ({
          id: attendanceDoc.id,
          ...attendanceDoc.data(),
        })),
      );
      return true;
    } catch (error) {
      if (requestId === dailyAttendanceRequestId.current) {
        setDailyAttendance([]);
        setDailyAttendanceError(attendanceLoadErrorMessage(error));
      }
      console.error("Could not load selected-date attendance from Firestore.", error);
      return false;
    } finally {
      if (requestId === dailyAttendanceRequestId.current) {
        setDailyAttendanceLoading(false);
      }
    }
  }, [currentUser, isAdmin, scopedGodown, selectedDate]);

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
    if (!isAdmin) {
      setUserAccounts([]);
      setStaffAccountsError("");
      setStaffAccountsLoading(false);
      return false;
    }

    setStaffAccountsLoading(true);
    setStaffAccountsError("");
    try {
      const snapshot = await getDocs(collection(db, "users"));
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
              role: profile.role,
              godown: profile.godown,
              active: profile.active === true,
            };
          })
          .filter((account) => account.role === "Staff"),
      );
      return true;
    } catch (error) {
      if (requestId === staffAccountsRequestId.current) {
        setUserAccounts([]);
        setStaffAccountsError(
          error.code === "permission-denied"
            ? "Firestore denied access to staff profiles. Verify the Admin access rules."
            : "Could not load staff profiles. Check your connection and try again.",
        );
      }
      console.error("Could not load staff profiles from Firestore.", error);
      return false;
    } finally {
      if (requestId === staffAccountsRequestId.current) {
        setStaffAccountsLoading(false);
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
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
  }, [isAdmin, loadStaffAccounts]);

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
          const validRole =
            profile.role === "Admin" || profile.role === "Staff";
          const validGodown =
            profile.role === "Admin" ||
            (typeof profile.godown === "string" &&
              godowns.includes(profile.godown));
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
            role: profile.role,
            godown: profile.role === "Admin" ? null : profile.godown,
          });
          setActiveGodown(
            profile.role === "Admin" ? "All godowns" : profile.godown,
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
          setAuthError("Unable to check your sign-in session. Please try again.");
          setAuthLoading(false);
        }
        console.error(
          "Firebase Authentication session check failed.",
          error,
        );
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
    if (!isAdmin) {
      throw new Error("Only an Admin can create a staff account.");
    }
    const email = details.email.trim();
    if (!godowns.includes(details.godown)) {
      throw new Error("Select one of the configured godowns.");
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
        role: "Staff",
        active: true,
        godown: details.godown,
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
      console.error("Could not clear the secondary Authentication session.", error);
    }

    const refreshed = await loadStaffAccounts();
    showToast(
      refreshed
        ? "Staff account created"
        : "Staff account created, but the staff list could not be refreshed.",
    );
    navigate("/users");
  };

  const updateStaffAccount = async (accountId, changes) => {
    if (!isAdmin) return;
    if (
      (Object.hasOwn(changes, "godown") &&
        !godowns.includes(changes.godown)) ||
      (Object.hasOwn(changes, "active") &&
        typeof changes.active !== "boolean")
    ) {
      setStaffAccountsError("Choose a valid godown or account status.");
      return;
    }

    setUpdatingStaffAccountId(accountId);
    setStaffAccountsError("");
    try {
      await updateDoc(doc(db, "users", accountId), changes);
      setUserAccounts((previous) =>
        previous.map((account) =>
          account.id === accountId ? { ...account, ...changes } : account,
        ),
      );
      showToast("Staff account updated");
    } catch (error) {
      setStaffAccountsError(
        error.code === "permission-denied"
          ? "Firestore denied this staff profile change. Verify the Admin access rules."
          : "Could not update this staff account. Please try again.",
      );
      console.error("Could not update a staff profile in Firestore.", error);
    } finally {
      setUpdatingStaffAccountId("");
    }
  };

  const scopedEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          scopedGodown === "All godowns" || employee.godown === scopedGodown,
      ),
    [employees, scopedGodown],
  );
  const visibleEmployees = useMemo(
    () =>
      scopedEmployees.filter((employee) =>
        `${employee.name} ${employee.role}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [scopedEmployees, search],
  );

  const attendanceRows = useMemo(
    () =>
      visibleEmployees.map((employee) => {
        const attendanceRecord = dailyAttendance.find(
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
    [visibleEmployees, dailyAttendance, selectedDate],
  );

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const saveEmployee = async (data) => {
    if (!currentUser || !isAdmin) {
      throw new Error("Only Admin accounts can manage employee records.");
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const role = typeof data.role === "string" ? data.role.trim() : "";
    const godown = isAdmin ? data.godown : modal?.employee?.godown;
    if (
      !name ||
      !role ||
      !godowns.includes(godown) ||
      !["Active", "Inactive"].includes(data.status)
    ) {
      throw new Error("Enter a name, job role, valid godown, and employment status.");
    }

    const employeeData = {
      name,
      role,
      status: data.status,
      updatedAt: serverTimestamp(),
    };
    if (isAdmin) employeeData.godown = godown;

    try {
      if (data.id) {
        await updateDoc(doc(db, "employees", data.id), employeeData);
      } else {
        await addDoc(collection(db, "employees"), {
          ...employeeData,
          godown,
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
    if (
      !employee ||
      !godowns.includes(employee.godown) ||
      (!isAdmin && employee.godown !== currentUser.godown) ||
      (isAdmin &&
        scopedGodown !== "All godowns" &&
        employee.godown !== scopedGodown)
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
        where("godown", "==", currentUser.godown),
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
          godown: employee.godown,
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
          godown: existingData.godown,
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

  if (authLoading || (currentUser && employeesLoading)) {
    return (
      <AuthLoadingScreen
        message={
          authLoading
            ? "Verifying your sign-in and account access..."
            : "Loading employee records..."
        }
      />
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
          <NavItem
            to="/reports"
            icon={<ChartNoAxesCombined size={18} />}
            label="Reports"
          />
          {isAdmin && (
            <NavItem
              to="/users"
              icon={<ShieldCheck size={18} />}
              label="User management"
            />
          )}
        </nav>
        {isAdmin ? (
          <div className="godown-nav">
            <div className="section-head">
              <span>GODOWNS</span>
              <span className="count-pill">09</span>
            </div>
            <button
              className={`godown-link ${activeGodown === "All godowns" ? "selected" : ""}`}
              onClick={() => {
                setActiveGodown("All godowns");
                navigate("/");
                setMobileOpen(false);
              }}
            >
              <Building2 size={16} />
              <span>All godowns</span>
            </button>
            {godowns.map((name) => (
              <button
                key={name}
                className={`godown-link ${activeGodown === name ? "selected" : ""}`}
                onClick={() => {
                  setActiveGodown(name);
                  navigate("/employees");
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
              <span>{currentUser.godown}</span>
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
              PeopleHub is a supporting register. Biometric records remain the
              primary reference.
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
              <strong>{titleMap[location.pathname] || "Workspace"}</strong>
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
            <button className="btn btn-secondary btn-small top-signout" onClick={signOut}>
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
                  employees={scopedEmployees}
                  attendance={dailyAttendance}
                  date={selectedDate}
                  setDate={setSelectedDate}
                  isAdmin={isAdmin}
                  activeGodown={scopedGodown}
                  setActiveGodown={setActiveGodown}
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
                  isAdmin={isAdmin}
                  activeGodown={scopedGodown}
                  loading={employeesLoading}
                  error={employeesError}
                  onRetry={loadEmployees}
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
                  activeGodown={scopedGodown}
                  loading={dailyAttendanceLoading}
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
                  attendance={attendance}
                  employees={visibleEmployees}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  navigate={navigate}
                  month={calendarMonth}
                  setMonth={setCalendarMonth}
                  loading={attendanceLoading}
                  error={attendanceError}
                  onRetry={loadCalendarAttendance}
                />
              }
            />
            <Route
              path="/reports"
              element={
                <Reports
                  employees={visibleEmployees}
                  attendance={reportAttendance}
                  activeGodown={scopedGodown}
                  from={reportFrom}
                  to={reportTo}
                  setFrom={setReportFrom}
                  setTo={setReportTo}
                  loading={reportAttendanceLoading}
                  hasMore={reportHasMore}
                  error={reportAttendanceError}
                  onRetry={() => loadReportAttendance(false)}
                  onLoadMore={() => loadReportAttendance(true)}
                />
              }
            />
            <Route
              path="/users"
              element={
                isAdmin ? (
                  <UsersPage
                    accounts={userAccounts}
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
                isAdmin ? (
                  <CreateStaffPage
                    accounts={userAccounts}
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
                <SettingsPage isAdmin={isAdmin} activeGodown={scopedGodown} />
              }
            />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <footer className="footer">
          <span>PeopleHub UI prototype</span>
          <span>
            Supporting records only · Biometric system remains primary
          </span>
        </footer>
      </main>

      {isAdmin && modal?.type === "employee" && (
        <EmployeeModal
          employee={modal.employee}
          onClose={() => setModal(null)}
          onSave={saveEmployee}
          isAdmin={isAdmin}
          defaultGodown={
            scopedGodown === "All godowns" ? "CEMENT" : scopedGodown
          }
        />
      )}
      {toast && (
        <div className="toast">
          <CircleCheck size={17} />
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
              {mode === "login" ? "Sign in to PeopleHub" : "Forgot your password?"}
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
            Authentication, password recovery, and account access are managed
            by Firebase.
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthLoadingScreen({ message = "Verifying your sign-in and account access..." }) {
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

function CreateStaffPage({ accounts, onCancel, onCreate }) {
  const [email, setEmail] = useState("");
  const [godown, setGodown] = useState(godowns[0]);
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
      await onCreate({ email: email.trim(), password, godown });
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
        subtitle="Set up sign-in details and assign this staff member to one godown."
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
            <h2>Staff details</h2>
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
              <span className="registration-field-label">Account role</span>
              <span className="role-badge staff-role">Staff</span>
              <small>This form always creates a Staff account.</small>
            </div>
            <div className="auth-field">
              <label htmlFor="staff-godown">Assigned godown</label>
              <select
                id="staff-godown"
                value={godown}
                onChange={(event) => setGodown(event.target.value)}
                required
              >
                {godowns.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <small>This account will only see this godown.</small>
            </div>
          </div>
          <div className="registration-passwords">
            <div
              className={`auth-field ${errors.password ? "has-error" : ""}`}
            >
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
              <label htmlFor="staff-confirm-password">
                Confirm password
              </label>
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
              {errors.confirmPassword && <small>{errors.confirmPassword}</small>}
            </div>
          </div>
        </div>
        <div className="registration-notice">
          <ShieldCheck size={16} />
          <span>
            This screen is restricted to Admin profiles, but client-side code
            cannot securely enforce Admin-only Authentication account creation.
            Use a trusted backend to enforce who can create Auth accounts;
            Firestore rules separately control profile access.
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
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            <Plus size={16} /> Create staff account
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
  if (error?.code === "unavailable" || error?.code === "network-request-failed") {
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
      return error?.message || "Could not create the staff account. Please try again.";
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
  activeGodown,
  setActiveGodown,
  navigate,
  setSearch,
}) {
  const scoped = employees.filter(
    (e) =>
      (isAdmin && activeGodown === "All godowns") || e.godown === activeGodown,
  );
  const todayRows = scoped.map(
    (e) =>
      attendance.find(
        (a) => String(a.employeeId) === String(e.id) && a.date === date,
      )
        ?.status || "Not marked",
  );
  const count = (s) => todayRows.filter((x) => x === s).length;
  const marked = todayRows.filter((x) => x !== "Not marked").length;
  const goStatus = (status) => navigate("/attendance", { state: { status } });
  return (
    <>
      <PageHeading
        eyebrow={isAdmin ? "COMPANY OVERVIEW" : "STAFF WORKSPACE"}
        title={isAdmin ? "Good morning, Admin" : "Welcome to your workspace"}
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
      <div className="notice-strip">
        <div className="notice-symbol">
          <ShieldCheck size={17} />
        </div>
        <div>
          <strong>Supporting record, not the source of truth</strong>
          <span>
            Use PeopleHub to make daily checking easier. Confirm attendance
            against your organization's official timekeeping records.
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
          label="Total employees"
          value={scoped.length}
          note="In selected view"
          icon={<Users size={19} />}
          tone="blue"
          onClick={() => navigate("/employees")}
        />
        <StatCard
          label="Present"
          value={count("Present")}
          note={`${marked ? Math.round((count("Present") / marked) * 100) : 0}% of marked`}
          icon={<CircleCheck size={19} />}
          tone="green"
          onClick={() => goStatus("Present")}
        />
        <StatCard
          label="Absent"
          value={count("Absent")}
          note="Needs follow-up"
          icon={<CircleX size={19} />}
          tone="red"
          onClick={() => goStatus("Absent")}
        />
        <StatCard
          label="Sick"
          value={count("Sick")}
          note="Marked sick"
          icon={<Clock3 size={19} />}
          tone="orange"
          onClick={() => goStatus("Sick")}
        />
        <StatCard
          label="On leave"
          value={count("On Leave")}
          note="Approved / reported leave"
          icon={<CalendarClock size={19} />}
          tone="purple"
          onClick={() => goStatus("On Leave")}
        />
        <StatCard
          label="Overtime"
          value={count("Overtime")}
          note="Worked beyond scheduled hours"
          icon={<Clock3 size={19} />}
          tone="blue"
          onClick={() => goStatus("Overtime")}
        />
      </div>
      {isAdmin && (
        <section className="panel godown-panel">
          <div className="panel-heading">
            <div>
              <h2>Godown overview</h2>
              <p>Choose a godown to view its register and attendance</p>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setActiveGodown("All godowns");
                navigate("/employees");
              }}
            >
              View all employees <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="godown-grid">
            {godowns.map((name) => {
              const members = employees.filter((e) => e.godown === name).length;
              const present = employees.filter(
                (e) =>
                  e.godown === name &&
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
                  key={name}
                  onClick={() => {
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
                    <span>{members} employees</span>
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
            {marked}
            <span> / {scoped.length} marked</span>
          </div>
          <span className="completion-percent">
            {scoped.length ? Math.round((marked / scoped.length) * 100) : 0}%
            complete
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

function Employees({
  employees,
  search,
  setSearch,
  onAdd,
  onEdit,
  isAdmin,
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
            <button className="btn btn-primary" onClick={onAdd}>
              <Plus size={16} /> Add employee
            </button>
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
          <button className="icon-button" title="More actions">
            <Download size={17} />
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>JOB ROLE</th>
                {isAdmin && <th>GODOWN</th>}
                <th>STATUS</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 3}
                    className="empty-state"
                    role="status"
                  >
                    Loading employee records...
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 3} className="empty-state">
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
                          <strong>{e.name}</strong>
                          <span>EMP-{String(e.id).padStart(4, "0")}</span>
                        </div>
                      </div>
                    </td>
                    <td>{e.role}</td>
                    {isAdmin && <td>{e.godown}</td>}
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
                      </td>
                    )}
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 3} className="empty-state">
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
  return (
    <>
      <PageHeading
        eyebrow="DAILY RECORD"
        title="Daily attendance"
        subtitle="Mark attendance and correct saved entries for the selected date."
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
      <div className="attendance-controls">
        <label className="date-input">
          <CalendarDays size={16} />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="filter-context">
          <Warehouse size={15} />
          {activeGodown}
        </div>
        <div className="control-spacer" />
        <label className="select-filter">
          <SlidersHorizontal size={15} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option>Not marked</option>
          </select>
        </label>
      </div>
      <div className="mini-stats">
        {statuses.map((s) => (
          <div className="mini-stat" key={s}>
            <span className={`mini-dot ${s.toLowerCase().replace(" ", "-")}`} />
            <span>{s}</span>
            <strong>{summary(s)}</strong>
          </div>
        ))}
      </div>
      <div className="panel table-panel">
        <div className="table-topline">
          <div>
            <strong>{filtered.length} employees</strong>
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
                {isAdmin && <th>GODOWN</th>}
                <th>ATTENDANCE STATUS</th>
                <th>LAST UPDATED</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    Loading attendance for {date}...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="empty-state">
                    Attendance could not be loaded.
                  </td>
                </tr>
              )}
              {!loading && !error && filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="employee-cell">
                      <div className="avatar small">{initials(e.name)}</div>
                      <div>
                        <strong>{e.name}</strong>
                      </div>
                    </div>
                  </td>
                  <td>{e.role}</td>
                  {isAdmin && <td>{e.godown}</td>}
                  <td>
                    <select
                      className={`attendance-select ${statusClass(e.attendance)}`}
                      value={e.attendance}
                      disabled={saving || Boolean(error)}
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
              {!loading && !error && filtered.length === 0 && (
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
  const visibleAttendance = loading ? [] : attendance;
  const countFor = (day) => {
    if (!day) return 0;
    const date = `${year}-${fmt(m + 1)}-${fmt(day)}`;
    return visibleAttendance.filter(
      (a) =>
        a.date === date &&
        employees.some((e) => String(e.id) === String(a.employeeId)),
    ).length;
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
              const n = countFor(day);
              return (
                <button
                  key={i}
                  disabled={!day}
                  className={`calendar-day ${date === selectedDate ? "chosen" : ""} ${date === today ? "today" : ""}`}
                  onClick={() => day && setSelectedDate(date)}
                >
                  <span>{day}</span>
                  {n > 0 && <i />}
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
              <i className="dot green-dot" />
              Has attendance entries
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
          Calendar indicators reflect saved attendance records in your
          permitted godown scope.
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
  setFrom,
  setTo,
  loading,
  hasMore,
  error,
  onRetry,
  onLoadMore,
}) {
  const rows = attendance.filter(
    (a) =>
      a.date >= from &&
      a.date <= to &&
      employees.some((e) => String(e.id) === String(a.employeeId)),
  );
  return (
    <>
      <PageHeading
        eyebrow="ATTENDANCE INSIGHTS"
        title="Reports"
        subtitle="Review attendance records over a selected period."
        action={
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Download size={16} /> Print report
          </button>
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
            value={rows.filter((a) => a.status === s).length}
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
          <span className="status-badge">{rows.length} loaded</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DATE</th>
                <th>EMPLOYEE</th>
                <th>GODOWN</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                rows.map((a) => {
                  const employee = employees.find(
                    (item) => String(item.id) === String(a.employeeId),
                  );
                  return (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>
                      <strong>
                        {a.employeeName || employee?.name || "Unknown employee"}
                      </strong>
                    </td>
                    <td>{a.godown || employee?.godown || "Unknown godown"}</td>
                    <td>
                      <span className={`status-badge ${statusClass(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              {loading && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    Loading attendance history...
                  </td>
                </tr>
              )}
              {!loading && !rows.length && (
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
        subtitle="View staff profiles, assign godowns, and manage account access."
        action={
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={16} /> Create staff account
          </button>
        }
      />
      <div className="notice-strip">
        <div className="notice-symbol">
          <LockKeyhole size={17} />
        </div>
        <div>
          <strong>Admin staff account management</strong>
          <span>
            Staff accounts are limited to one assigned godown. Account deletion
            is not available here.
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
                    Loading staff profiles...
                  </td>
                </tr>
              )}
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="employee-cell">
                      <div className="avatar small">
                        {initials(account.name || account.email)}
                      </div>
                      <div>
                        <strong>{account.name || "Staff account"}</strong>
                        <span>{account.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`role-badge ${account.role === "Admin" ? "admin-role" : "staff-role"}`}
                    >
                      {account.role}
                    </span>
                  </td>
                  <td>
                    <select
                      className="staff-godown-select"
                      aria-label={`Assigned godown for ${account.email}`}
                      value={
                        godowns.includes(account.godown) ? account.godown : ""
                      }
                      disabled={Boolean(updatingAccountId)}
                      onChange={(event) =>
                        onUpdate(account.id, { godown: event.target.value })
                      }
                    >
                      <option value="">Select a godown</option>
                      {godowns.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
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
                      disabled={Boolean(updatingAccountId)}
                      onClick={() =>
                        onUpdate(account.id, { active: !account.active })
                      }
                    >
                      {account.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !error && !accounts.length && (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No staff profiles found.
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

function SettingsPage({ isAdmin, activeGodown }) {
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE PREFERENCES"
        title="Settings"
        subtitle="Basic application information and configuration preview."
      />
      <div className="settings-grid">
        <div className="panel settings-card">
          <div className="settings-icon">
            <Building2 size={19} />
          </div>
          <h3>Company workspace</h3>
          <p>PeopleHub employee register and attendance support tool.</p>
          <span className="settings-meta">9 godowns configured in demo UI</span>
        </div>
        <div className="panel settings-card">
          <div className="settings-icon">
            <ShieldCheck size={19} />
          </div>
          <h3>Account access</h3>
          <p>
            {isAdmin
              ? "You are previewing the Admin experience."
              : `Your Staff account is assigned to ${activeGodown}.`}
          </p>
          <span className="settings-meta">
            {isAdmin ? "Admin · all godowns" : `Staff · ${activeGodown}`}
          </span>
        </div>
        <div className="panel settings-card">
          <div className="settings-icon">
            <History size={19} />
          </div>
          <h3>Attendance history</h3>
          <p>Corrections will preserve who changed a record and when.</p>
          <span className="settings-meta">
            Audit history planned for database phase
          </span>
        </div>
      </div>
    </>
  );
}

function EmployeeModal({
  employee,
  onClose,
  onSave,
  defaultGodown,
  isAdmin,
}) {
  const [form, setForm] = useState(
    employee || {
      name: "",
      role: "Loader",
      godown: defaultGodown,
      status: "Active",
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
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
              onChange={(e) => update("role", e.target.value)}
            >
              {["Loader", "Supervisor", "Clerk", "IT Clerk"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Godown
            {isAdmin ? (
              <select
                required
                value={form.godown}
                onChange={(e) => update("godown", e.target.value)}
              >
                {godowns.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            ) : (
              <div className="fixed-godown">
                <Warehouse size={15} /> {form.godown}
              </div>
            )}
            {!isAdmin && (
              <span className="field-hint">
                Your account can only manage records in this godown.
              </span>
            )}
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

function formatLocalDate(date) {
  return `${date.getFullYear()}-${fmt(date.getMonth() + 1)}-${fmt(date.getDate())}`;
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
