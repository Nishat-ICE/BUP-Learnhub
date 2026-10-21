import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import LeadershipReport, {
  downloadAcademicCsv
} from "../components/LeadershipReport.jsx";
import api from "../api/api";
import "../styles/leadership.css";
import "../styles/reset-flow.css";

const blankUser = {
  name: "",
  email: "",
  role: "admin",
  department: "",
  section: "",
  studentId: "",
  password: ""
};

const roleNames = ["student", "faculty", "staff", "admin", "authority"];
const messageOf = (err) =>
  err.response?.data?.message || err.message || "Request failed.";

export default function AdminPanel() {
  const [tab, setTab] = useState("overview");
  const [report, setReport] = useState(null);
  const [users, setUsers] = useState({
    items: [],
    total: 0,
    page: 1,
    pages: 1
  });
  const [courses, setCourses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activity, setActivity] = useState([]);
  const [form, setForm] = useState({ ...blankUser });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [courseId, setCourseId] = useState("");
  const [roster, setRoster] = useState([]);
  const [studentEmail, setStudentEmail] = useState("");
  const [issued, setIssued] = useState(null);
  const [notice, setNotice] = useState(null);
  const [resetRequests, setResetRequests] = useState([]);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [approvedReset, setApprovedReset] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadUsers(page = 1) {
    const result = await api.get("/management/users", {
      params: {
        page,
        q: search,
        role: filterRole
      }
    });

    setUsers(result.data);
  }

  async function loadRoster(id = courseId) {
    if (!id) {
      setRoster([]);
      return;
    }

    const result = await api.get(
      `/management/enrollments/${id}`
    );

    setRoster(result.data.students || []);
  }

  async function refresh() {
    const [reportResult, courseResult, settingsResult, activityResult] =
      await Promise.all([
        api.get("/management/report"),
        api.get("/courses"),
        api.get("/management/settings"),
        api.get("/management/activity")
      ]);

    setReport(reportResult.data);
    setCourses(courseResult.data);
    setSettings(settingsResult.data);
    setActivity(activityResult.data);

    await loadUsers(users.page || 1);
  }

  useEffect(() => {
    refresh().catch((err) => {
      setNotice({ kind: "error", text: messageOf(err) });
    });
  }, []);

  async function act(job, success, after) {
    setBusy(true);
    setNotice(null);

    try {
      const result = await job();
      if (after) after(result.data);
      await refresh();
      if (courseId) await loadRoster(courseId);
      setNotice({ kind: "success", text: success });
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  const changeForm = (event) =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));

  const saveUser = (event) => {
    event.preventDefault();

    const isEditing = Boolean(editingId);
    const payload = { ...form };
    delete payload.password;

    act(
      () =>
        isEditing
          ? api.put(`/management/users/${editingId}`, payload)
          : api.post("/management/users", form),
      isEditing ? "User updated." : "User created.",
      (data) => {
        if (!isEditing) {
          setIssued({
            email: data.user.email,
            password: data.temporaryPassword
          });
        }
        setForm({ ...blankUser });
        setEditingId(null);
      }
    );
  };

  const editUser = (user) => {
    setEditingId(user._id);
    setIssued(null);
    setForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role,
      department: user.department || "",
      section: user.section || "",
      studentId: user.studentId || "",
      password: ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...blankUser });
  };

  async function loadResetRequests() {
    const response = await api.get("/password-reset/admin/requests");
    setResetRequests(response.data.items || []);
    setPendingResetCount(response.data.pendingCount || 0);
  }

  useEffect(() => {
    loadResetRequests().catch((err) => {
      setNotice({ kind: "error", text: messageOf(err) });
    });

    const timer = setInterval(() => {
      loadResetRequests().catch(() => {});
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  async function decideReset(request, decision) {
    if (
      decision === "approve" &&
      !window.confirm(
        `Have you verified the identity of ${request.user?.email}? Approve only after verification.`
      )
    ) {
      return;
    }

    if (
      decision === "reject" &&
      !window.confirm(`Reject reset request for ${request.user?.email}?`)
    ) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const result = await api.post(
        `/password-reset/admin/requests/${request._id}/${decision}`
      );

      if (decision === "approve") {
        setApprovedReset({
          email: result.data.email,
          code: result.data.code,
          expiresAt: result.data.expiresAt
        });
      }

      await loadResetRequests();

      setNotice({
        kind: "success",
        text:
          decision === "approve"
            ? "Request approved. Give the one-time code to the verified user privately."
            : "Request rejected."
      });
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }
  const exportCsv = async () => {
    try {
      await downloadAcademicCsv();
    } catch (err) {
      setNotice({ kind: "error", text: messageOf(err) });
    }
  };

  return (
    <Layout title="System Administration">
      <div className="lead-page">
        <section className="lead-hero">
          <span>MANAGEMENT CONSOLE</span>
          <h1>Academic operations, clearly managed.</h1>
          <p>
            Monitor real academic records and administer users,
            enrollment and system access from one place.
          </p>
        </section>

        <nav className="lead-tabs" aria-label="Admin sections">
          {[
            ["overview", "Overview"],
            ["users", "Users & Roles"],
            ["resets", pendingResetCount ? "Password Requests (" + pendingResetCount + ")" : "Password Requests"],
            ["enrollments", "Enrollment"],
            ["settings", "Settings"],
            ["activity", "Activity"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "lead-tab active" : "lead-tab"}
              onClick={() => {
                setTab(key);
                setNotice(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {notice && (
          <div
            role="alert"
            className={`lead-alert ${notice.kind}`}
          >
            {notice.text}
          </div>
        )}

        {issued && (
          <div className="lead-credential" role="status">
            <strong>New account login â€” copy it now</strong>
            <p>Email: {issued.email}</p>
            <p>Password: {issued.password}</p>
            <button
              type="button"
              className="lead-quiet"
              onClick={() => setIssued(null)}
            >
              I've saved it
            </button>
          </div>
        )}

        {tab === "overview" && (
          <>
            <div className="lead-header">
              <h2>Live academic overview</h2>
              <button
                type="button"
                className="lead-primary"
                onClick={exportCsv}
              >
                Download CSV report
              </button>
            </div>

            <LeadershipReport report={report} />

            <div className="lead-panel">
  <h3>Administrative responsibilities</h3>
  <p className="lead-muted">
    Manage accounts and roles, enrollment, system settings,
    activity logs and academic reports from the tabs above.
    Faculty manage assessments and grades; Academic Staff
    publish calendars, reschedules and institutional notices.
  </p>
</div>
          </>
        )}

        {tab === "resets" && (
          <div className="lead-panel">
            <div className="lead-header">
              <h2>Password reset requests ({pendingResetCount})</h2>
              <button
                type="button"
                className="lead-quiet"
                onClick={() =>
                  loadResetRequests().catch((err) =>
                    setNotice({
                      kind: "error",
                      text: messageOf(err)
                    })
                  )
                }
              >
                Refresh
              </button>
            </div>

            <p className="lead-muted">
              Verify the person's identity before approval.
              Approval generates a one-time code valid for 20 minutes.
              No email service is configured; deliver the code privately.
              The user sets their own new password.
            </p>

            {approvedReset && (
              <div className="reset-flow-approved" role="status">
                <strong>One-time code â€” shown only now</strong>
                <p>Account: {approvedReset.email}</p>
                <code>{approvedReset.code}</code>
                <p>
                  Expires:{" "}
                  {new Date(
                    approvedReset.expiresAt
                  ).toLocaleTimeString()}
                </p>
                <button
                  type="button"
                  className="lead-quiet"
                  onClick={() => setApprovedReset(null)}
                >
                  I've delivered the code privately
                </button>
              </div>
            )}

            {resetRequests.length === 0 && (
              <p className="lead-muted">
                No pending password reset requests.
              </p>
            )}

            {resetRequests.map((request) => (
              <div className="reset-flow-request" key={request._id}>
                <div>
                  <strong>{request.user?.name || "Unknown user"}</strong>
                  <small>
                    {request.user?.email || "Account unavailable"} Â·{" "}
                    {request.user?.role || "Unknown role"}
                  </small>
                  <small>
                    Requested:{" "}
                    {new Date(
                      request.createdAt
                    ).toLocaleString()}
                  </small>
                </div>

                <div className="lead-actions">
                  <button
                    type="button"
                    className="lead-primary"
                    disabled={busy || !request.user}
                    onClick={() => decideReset(request, "approve")}
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    className="lead-quiet"
                    disabled={busy}
                    onClick={() => decideReset(request, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "users" && (
          <>
            <div className="lead-panel">
              <div className="lead-header">
                <h2>{editingId ? "Edit user" : "Create user"}</h2>
                {editingId && (
                  <button
                    type="button"
                    className="lead-quiet"
                    onClick={resetForm}
                  >
                    Cancel editing
                  </button>
                )}
              </div>

              <p className="lead-muted">New Admin and Authority accounts are created here. Students, Faculty and Staff register themselves.</p>
              <form className="lead-form" onSubmit={saveUser}>
                <label>
                  Full name
                  <input
                    name="name"
                    value={form.name}
                    onChange={changeForm}
                    required
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={changeForm}
                    required
                  />
                </label>

                <label>
                  Role
                  <select
                    name="role"
                    value={form.role}
                    onChange={changeForm}
                  >
                    {(editingId ? roleNames : ["admin", "authority"]).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Department
                  <input
                    name="department"
                    value={form.department}
                    onChange={changeForm}
                    required
                  />
                </label>

                <label>
                  Section
                  <input
                    name="section"
                    value={form.section}
                    onChange={changeForm}
                  />
                </label>

                <label>
                  Student ID
                  <input
                    name="studentId"
                    value={form.studentId}
                    onChange={changeForm}
                  />
                </label>

                {!editingId && (
                  <label className="lead-full">
                    Initial password â€” optional
                    <input
                      name="password"
                      type="password"
                      minLength="12"
                      value={form.password}
                      onChange={changeForm}
                      placeholder="Leave empty to generate a secure password"
                    />
                  </label>
                )}

                <button
                  className="lead-primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Saving..."
                    : editingId
                    ? "Save user"
                    : "Create user"}
                </button>
              </form>
            </div>

            <div className="lead-panel">
              <h2>User accounts</h2>

              <form
                className="lead-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  loadUsers(1).catch((err) =>
                    setNotice({
                      kind: "error",
                      text: messageOf(err)
                    })
                  );
                }}
              >
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or student ID"
                />

                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                >
                  <option value="">All roles</option>
                  {roleNames.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>

                <button type="submit" className="lead-primary">
                  Search
                </button>
              </form>

              <div className="lead-table-wrap">
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.items.map((user) => (
                      <tr key={user._id}>
                        <td>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </td>
                        <td>{user.role}</td>
                        <td>{user.department || "â€”"}</td>
                        <td>
                          <span
                            className={
                              user.isActive
                                ? "lead-badge live"
                                : "lead-badge off"
                            }
                          >
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="lead-actions">
                            <button
                              type="button"
                              className="lead-quiet"
                              onClick={() => editUser(user)}
                            >
                              Edit
                            </button>

                            

                            <button
                              type="button"
                              className="lead-quiet"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `${user.isActive ? "Deactivate" : "Activate"} ${user.email}?`
                                  )
                                ) return;

                                act(
                                  () =>
                                    api.patch(
                                      `/management/users/${user._id}/status`,
                                      {
                                        isActive: !user.isActive
                                      }
                                    ),
                                  "Account status updated."
                                );
                              }}
                            >
                              {user.isActive
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.items.length === 0 && (
                <p className="lead-muted">No matching users.</p>
              )}

              <div className="lead-pagination">
                <span>
                  {users.total} users Â· page {users.page} of {users.pages}
                </span>
                <button
                  type="button"
                  className="lead-quiet"
                  disabled={users.page <= 1}
                  onClick={() => loadUsers(users.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="lead-quiet"
                  disabled={users.page >= users.pages}
                  onClick={() => loadUsers(users.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "enrollments" && (
          <div className="lead-panel">
            <h2>Course enrollment</h2>
            <p className="lead-muted">
              Add a student by email. Existing submissions prevent
              removing that student's enrollment.
            </p>

            <label className="lead-block-label">
              Course
              <select
                value={courseId}
                onChange={(event) => {
                  const id = event.target.value;
                  setCourseId(id);
                  loadRoster(id).catch((err) =>
                    setNotice({
                      kind: "error",
                      text: messageOf(err)
                    })
                  );
                }}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.code} â€” {course.title}
                  </option>
                ))}
              </select>
            </label>

            {courseId && (
              <>
                <form
                  className="lead-search"
                  onSubmit={(event) => {
                    event.preventDefault();

                    act(
                      () =>
                        api.post("/management/enrollments", {
                          courseId,
                          studentEmail
                        }),
                      "Enrollment updated.",
                      () => setStudentEmail("")
                    );
                  }}
                >
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={studentEmail}
                    onChange={(e) =>
                      setStudentEmail(e.target.value)
                    }
                    required
                  />

                  <button
                    type="submit"
                    disabled={busy}
                    className="lead-primary"
                  >
                    Enroll student
                  </button>
                </form>

                <div className="lead-table-wrap">
                  <table className="lead-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Section</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((student) => (
                        <tr key={student._id}>
                          <td>
                            {student.name}
                            <small>{student.email}</small>
                          </td>
                          <td>{student.section || "â€”"}</td>
                          <td>
                            <button
                              type="button"
                              className="lead-quiet"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Remove ${student.name} from this course?`
                                  )
                                ) return;

                                act(
                                  () =>
                                    api.delete(
                                      `/management/enrollments/${courseId}/${student._id}`
                                    ),
                                  "Enrollment removed."
                                );
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {roster.length === 0 && (
                  <p className="lead-muted">
                    No students enrolled in this course.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="lead-panel">
            <h2>System access settings</h2>
            <p className="lead-muted">
              Public registration is limited to Student, Faculty and
              Academic Staff. Admin and Authority accounts are not
              publicly registrable.
            </p>

            <div className="lead-setting">
              <div>
                <strong>Allow public registration</strong>
                <p>
                  Turning this off blocks new registrations; existing
                  accounts can still sign in.
                </p>
              </div>

              <button
                type="button"
                className="lead-primary"
                disabled={busy || !settings}
                onClick={() =>
                  act(
                    () =>
                      api.put("/management/settings", {
                        registrationEnabled:
                          !settings.registrationEnabled
                      }),
                    "Registration setting saved."
                  )
                }
              >
                {settings?.registrationEnabled
                  ? "Enabled Â· click to disable"
                  : "Disabled Â· click to enable"}
              </button>
            </div>

            <p className="lead-footnote">
              Role-based API permissions are currently defined in the
              backend. A custom per-permission editor is not implemented.
            </p>
          </div>
        )}

        {tab === "activity" && (
          <div className="lead-panel">
            <h2>Management activity</h2>
            <p className="lead-muted">
              Recent account, enrollment, setting and policy changes.
            </p>

            {activity.map((entry) => (
              <div className="lead-activity" key={entry._id}>
                <div>
                  <strong>{entry.action.replaceAll("_", " ")}</strong>
                  <small>
                    {entry.actor?.name || "Account removed"}
                    {entry.detail ? ` Â· ${entry.detail}` : ""}
                  </small>
                </div>
                <time>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </div>
            ))}

            {activity.length === 0 && (
              <p className="lead-muted">
                No management actions recorded yet.
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}