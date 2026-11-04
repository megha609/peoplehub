import { useMemo, useState } from "react";
import {
  NavLink,
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
  ChevronDown,
  ChevronRight,
  Warehouse,
  Plus,
  Download,
  Filter,
  MoreHorizontal,
  Pencil,
  Eye,
  LogOut,
  ShieldCheck,
  UserRound,
  Clock3,
  CircleCheck,
  CircleX,
  CalendarClock,
  X,
  Save,
  ArrowUpRight,
  PanelLeftClose,
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
  "/settings": "Settings",
};
const fmt = (n) => String(n).padStart(2, "0");

function App() {
  const [role, setRole] = useState("Admin");
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
  const isAdmin = role === "Admin";
  const scopedGodown = isAdmin ? activeGodown : "CEMENT";

  const visibleEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          (scopedGodown === "All godowns" || e.godown === scopedGodown) &&
          `${e.name} ${e.phone} ${e.biometricId} ${e.role}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [employees, scopedGodown, search],
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
    if (data.id) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === data.id ? { ...e, ...data } : e)),
      );
      showToast("Employee details updated");
    } else {
      const newId = Math.max(0, ...employees.map((e) => e.id)) + 1;
      setEmployees((prev) => [
        ...prev,
        { ...data, id: newId, status: "Active" },
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
              <span>CEMENT</span>
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
            <div className="avatar">{isAdmin ? "AD" : "IT"}</div>
            <div className="profile-copy">
              <strong>{isAdmin ? "System Admin" : "Godown Staff"}</strong>
              <span>{role} account</span>
            </div>
            <MoreHorizontal size={18} />
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
            <label className="role-preview">
              <span>Preview as</span>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setActiveGodown("All godowns");
                }}
              >
                <option>Admin</option>
                <option>Staff</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">{isAdmin ? "AD" : "IT"}</div>
          </div>
        </header>

        <div className="content">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  employees={employees}
                  attendance={attendance}
                  date={selectedDate}
                  setDate={setSelectedDate}
                  isAdmin={isAdmin}
                  activeGodown={activeGodown}
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
                  <UsersPage />
                ) : (
                  <Dashboard
                    employees={employees}
                    attendance={attendance}
                    date={selectedDate}
                    setDate={setSelectedDate}
                    isAdmin={false}
                    activeGodown="CEMENT"
                    setActiveGodown={setActiveGodown}
                    navigate={navigate}
                    setSearch={setSearch}
                  />
                )
              }
            />
            <Route
              path="/settings"
              element={<SettingsPage isAdmin={isAdmin} />}
            />
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
      !isAdmin || activeGodown === "All godowns" || e.godown === activeGodown,
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
            onClick={() => window.location.assign("/attendance")}
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

function UsersPage() {
  return (
    <>
      <PageHeading
        eyebrow="ACCESS CONTROL"
        title="User management"
        subtitle="A preview of how Admin and Staff accounts will be managed."
        action={
          <button
            className="btn btn-primary"
            onClick={() =>
              alert(
                "User creation will be connected after database and authentication setup.",
              )
            }
          >
            <Plus size={16} /> Add user
          </button>
        }
      />
      <div className="notice-strip">
        <div className="notice-symbol">
          <ShieldCheck size={17} />
        </div>
        <div>
          <strong>Access rules will be enforced by the backend</strong>
          <span>
            This page is a UI preview. Hiding screens is not a security
            boundary; server-side permissions will be implemented when we
            connect the database.
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="employee-cell">
                    <div className="avatar small">AD</div>
                    <div>
                      <strong>System Admin</strong>
                      <span>admin@example.com</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge admin-role">Admin</span>
                </td>
                <td>All godowns</td>
                <td>
                  <span className="status-badge active-status">Active</span>
                </td>
                <td>
                  <button className="icon-button">
                    <MoreHorizontal size={17} />
                  </button>
                </td>
              </tr>
              <tr>
                <td>
                  <div className="employee-cell">
                    <div className="avatar small">BK</div>
                    <div>
                      <strong>Brian Kiptoo</strong>
                      <span>brian@example.com</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role-badge staff-role">Staff</span>
                </td>
                <td>CEMENT</td>
                <td>
                  <span className="status-badge active-status">Active</span>
                </td>
                <td>
                  <button className="icon-button">
                    <MoreHorizontal size={17} />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SettingsPage({ isAdmin }) {
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
              : "You are previewing the Staff experience for CEMENT."}
          </p>
          <span className="settings-meta">
            Role preview only — authentication comes later
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

function EmployeeModal({ employee, onClose, onSave, defaultGodown }) {
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
            <select
              value={form.godown}
              onChange={(e) => update("godown", e.target.value)}
            >
              {godowns.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <span className="field-hint">
              In the live app, Staff accounts will be restricted to their
              assigned godown.
            </span>
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
