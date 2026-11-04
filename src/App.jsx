import { useMemo, useState } from "react";
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
  KeyRound,
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
import { godowns, initialEmployees, initialAttendance } from "./data";

const today = "2026-11-04";
const statuses = ["Present", "Absent", "Sick", "On Leave"];
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
const fmt = (n) => String(n).padStart(2, "0");
const demoAdmin = {
  id: "demo-admin",
  name: "System Admin",
  email: "admin@peoplehub.demo",
  password: "PeopleHub2026!",
  role: "Admin",
  godown: null,
  status: "Active",
};

function App() {
  const [userAccounts, setUserAccounts] = useState([demoAdmin]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeGodown, setActiveGodown] = useState("All godowns");
  const [employees, setEmployees] = useState(initialEmployees);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "Admin";
  const scopedGodown = isAdmin ? activeGodown : currentUser?.godown;

  const signIn = (email, password) => {
    const account = userAccounts.find(
      (user) =>
        user.email.toLowerCase() === email.trim().toLowerCase() &&
        user.password === password &&
        user.status === "Active",
    );
    if (!account) return false;
    const { password: _password, ...safeAccount } = account;
    setCurrentUser(safeAccount);
    setActiveGodown(account.role === "Admin" ? "All godowns" : account.godown);
    navigate("/", { replace: true });
    return true;
  };

  const signOut = () => {
    setCurrentUser(null);
    setModal(null);
    navigate("/login", { replace: true });
  };

  const createStaffAccount = (details) => {
    if (!isAdmin) return false;
    if (
      userAccounts.some(
        (account) =>
          account.email.toLowerCase() === details.email.trim().toLowerCase(),
      )
    ) {
      return false;
    }
    setUserAccounts((previous) => [
      ...previous,
      {
        ...details,
        id: `staff-${Date.now()}`,
        email: details.email.trim(),
        role: "Staff",
        status: "Active",
      },
    ]);
    showToast("Staff account created");
    navigate("/users");
    return true;
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
        `${employee.name} ${employee.phone} ${employee.biometricId} ${employee.role}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [scopedEmployees, search],
  );

  const attendanceRows = useMemo(
    () =>
      visibleEmployees.map((employee) => ({
        ...employee,
        attendance:
          attendance.find(
            (a) => a.employeeId === employee.id && a.date === selectedDate,
          )?.status || "Not marked",
      })),
    [visibleEmployees, attendance, selectedDate],
  );

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const saveEmployee = (data) => {
    const employeeData = isAdmin
      ? data
      : { ...data, godown: scopedGodown };
    if (data.id) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === data.id ? { ...e, ...employeeData } : e,
        ),
      );
      showToast("Employee details updated");
    } else {
      const newId = Math.max(0, ...employees.map((e) => e.id)) + 1;
      setEmployees((prev) => [
        ...prev,
        { ...employeeData, id: newId, status: "Active" },
      ]);
      showToast("Employee added to demo register");
    }
    setModal(null);
  };

  const saveAttendance = (employeeId, status) => {
    setAttendance((prev) => {
      const existing = prev.find(
        (a) => a.employeeId === employeeId && a.date === selectedDate,
      );
      const next = {
        id: existing?.id || Date.now(),
        employeeId,
        date: selectedDate,
        status,
        updatedBy: isAdmin ? "Admin" : "Staff user",
        updatedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      return existing
        ? prev.map((a) => (a.id === existing.id ? next : a))
        : [...prev, next];
    });
  };

  const openAddEmployee = () => setModal({ type: "employee" });
  const openEditEmployee = (employee) =>
    setModal({ type: "employee", employee });

  if (!currentUser) {
    return <LoginPage onLogin={signIn} />;
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
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  employees={scopedEmployees}
                  attendance={attendance}
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
                  allEmployees={employees}
                  search={search}
                  setSearch={setSearch}
                  onAdd={openAddEmployee}
                  onEdit={openEditEmployee}
                  isAdmin={isAdmin}
                  activeGodown={scopedGodown}
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
                />
              }
            />
            <Route
              path="/reports"
              element={
                <Reports
                  employees={visibleEmployees}
                  attendance={attendance}
                  isAdmin={isAdmin}
                  activeGodown={scopedGodown}
                />
              }
            />
            <Route
              path="/users"
              element={
                isAdmin ? (
                  <UsersPage
                    accounts={userAccounts.map(
                      ({ password: _password, ...account }) => account,
                    )}
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
                    accounts={userAccounts.map(
                      ({ password: _password, ...account }) => account,
                    )}
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

      {modal?.type === "employee" && (
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

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submitLogin = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!onLogin(email, password)) {
      setError("Email or password is incorrect. Check your details and try again.");
    }
  };

  const submitReset = (event) => {
    event.preventDefault();
    setError("");
    setMessage(
      "Password reset emails will be available when Firebase Authentication is connected. No email was sent.",
    );
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
            <h2>{mode === "login" ? "Sign in to PeopleHub" : "Forgot your password?"}</h2>
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
              <button className="btn btn-primary auth-submit" type="submit">
                Sign in <ArrowUpRight size={16} />
              </button>
              <div className="demo-access">
                <div className="demo-access-top">
                  <span className="demo-access-icon">
                    <KeyRound size={15} />
                  </span>
                  <strong>Prototype demo access</strong>
                  <span className="demo-label">DEMO</span>
                </div>
                <p>
                  <span>admin@peoplehub.demo</span>
                  <span>PeopleHub2026!</span>
                </p>
                <button
                  type="button"
                  className="auth-link demo-fill"
                  onClick={() => {
                    setEmail("admin@peoplehub.demo");
                    setPassword("PeopleHub2026!");
                    setError("");
                  }}
                >
                  Fill demo credentials
                </button>
              </div>
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
              <button className="btn btn-primary auth-submit" type="submit">
                Request reset link <ArrowUpRight size={16} />
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
            UI prototype only. Authentication, password recovery, and access
            enforcement will be connected to Firebase.
          </p>
        </div>
      </section>
    </main>
  );
}

function CreateStaffPage({ accounts, onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [godown, setGodown] = useState(godowns[0]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = "Enter the staff member's name.";
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

    const created = onCreate({
      name: name.trim(),
      email: email.trim(),
      password,
      godown,
    });
    if (!created) {
      setErrors({ email: "An account with this email already exists." });
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
          <div className={`auth-field ${errors.name ? "has-error" : ""}`}>
            <label htmlFor="staff-name">Full name</label>
            <input
              id="staff-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter their full name"
              required
            />
            {errors.name && <small>{errors.name}</small>}
          </div>
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
              <small>Only Admin can assign roles or create accounts.</small>
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
            This prototype keeps new accounts in memory only. Firebase
            Authentication and Firestore will handle account creation and
            godown permissions in the connected app.
          </span>
        </div>
        <div className="registration-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            <Plus size={16} /> Create staff account
          </button>
        </div>
      </form>
    </>
  );
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
      attendance.find((a) => a.employeeId === e.id && a.date === date)
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
            Use PeopleHub to make daily checking easier. Biometric clock-in
            records remain your primary attendance reference.
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
      <div className="stats-grid">
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
  allEmployees,
  search,
  setSearch,
  onAdd,
  onEdit,
  isAdmin,
  activeGodown,
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
        subtitle="Maintain employee details and biometric identification references."
        action={
          <button className="btn btn-primary" onClick={onAdd}>
            <Plus size={16} /> Add employee
          </button>
        }
      />
      <div className="filter-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="Search name, phone or biometric ID..."
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
                <th>PHONE NUMBER</th>
                <th>BIOMETRIC ID</th>
                {isAdmin && <th>GODOWN</th>}
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
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
                  <td>{e.phone}</td>
                  <td>
                    <span className="mono">{e.biometricId}</span>
                  </td>
                  {isAdmin && <td>{e.godown}</td>}
                  <td>
                    <span className="status-badge active-status">
                      {e.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button row-action"
                      onClick={() => onEdit(e)}
                      title="Edit employee"
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="empty-state">
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
          <span>Demo data</span>
        </div>
      </div>
    </>
  );
}

function Attendance({ rows, date, setDate, onMark, isAdmin, activeGodown }) {
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
        subtitle="Mark attendance and correct entries when needed. Changes are shown in this prototype only."
      />
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
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="employee-cell">
                      <div className="avatar small">{initials(e.name)}</div>
                      <div>
                        <strong>{e.name}</strong>
                        <span className="mono">{e.biometricId}</span>
                      </div>
                    </div>
                  </td>
                  <td>{e.role}</td>
                  {isAdmin && <td>{e.godown}</td>}
                  <td>
                    <select
                      className={`attendance-select ${statusClass(e.attendance)}`}
                      value={e.attendance}
                      onChange={(ev) => onMark(e.id, ev.target.value)}
                    >
                      <option>Not marked</option>
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="muted-small">Editable demo entry</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
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
            In the connected version, every correction will retain the previous
            value, new value, editor and timestamp.
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
}) {
  const [month, setMonth] = useState(new Date(2026, 10, 1));
  const year = month.getFullYear(),
    m = month.getMonth();
  const first = new Date(year, m, 1).getDay();
  const days = new Date(year, m + 1, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const countFor = (day) => {
    if (!day) return 0;
    const date = `${year}-${fmt(m + 1)}-${fmt(day)}`;
    return attendance.filter(
      (a) => a.date === date && employees.some((e) => e.id === a.employeeId),
    ).length;
  };
  const selectedRows = attendance.filter(
    (a) =>
      a.date === selectedDate && employees.some((e) => e.id === a.employeeId),
  );
  return (
    <>
      <PageHeading
        eyebrow="DATE FILTERS"
        title="Attendance calendar"
        subtitle="Choose a day to review or update attendance. Select a date to open its daily register."
      />
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
            <strong>{selectedRows.length}</strong>
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
          Calendar indicators are based on available demo attendance entries.
          The connected version will show saved attendance for all dates.
        </span>
      </div>
    </>
  );
}

function Reports({ employees, attendance, isAdmin, activeGodown }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const rows = attendance.filter(
    (a) =>
      a.date >= from &&
      a.date <= to &&
      employees.some((e) => e.id === a.employeeId),
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
            note="Entries in selected period"
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
          <span className="status-badge">{rows.length} records</span>
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
              {rows.map((a) => {
                const e = employees.find((x) => x.id === a.employeeId);
                return (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>
                      <strong>{e?.name}</strong>
                    </td>
                    <td>{e?.godown}</td>
                    <td>
                      <span className={`status-badge ${statusClass(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No entries in this date range.
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

function UsersPage({ accounts, onCreate }) {
  return (
    <>
      <PageHeading
        eyebrow="ACCESS CONTROL"
        title="User management"
        subtitle="Create staff accounts and assign each person to their godown."
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
          <strong>Only Admin can create accounts</strong>
          <span>
            Staff accounts have access to one assigned godown. Account data in
            this UI prototype resets when the page is refreshed.
          </span>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>USER</th>
                <th>ACCOUNT ROLE</th>
                <th>ASSIGNED GODOWN</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="employee-cell">
                      <div className="avatar small">
                        {initials(account.name)}
                      </div>
                      <div>
                        <strong>{account.name}</strong>
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
                  <td>{account.role === "Admin" ? "All godowns" : account.godown}</td>
                  <td>
                    <span className="status-badge active-status">
                      {account.status}
                    </span>
                  </td>
                </tr>
              ))}
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
      phone: "",
      role: "Loader",
      biometricId: "",
      godown: defaultGodown,
      status: "Active",
    },
  );
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (e) => {
    e.preventDefault();
    onSave(form);
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
          <div className="form-two">
            <label>
              Phone number
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="07XX XXX XXX"
              />
            </label>
            <label>
              Job role
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
              >
                {["Loader", "Supervisor", "Clerk", "IT Clerk"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Biometric identification ID
            <input
              required
              value={form.biometricId}
              onChange={(e) => update("biometricId", e.target.value)}
              placeholder="Must match the clock-in machine ID"
            />
          </label>
          <label>
            Godown
            {isAdmin ? (
              <select
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
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            <Save size={16} /> Save employee
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
