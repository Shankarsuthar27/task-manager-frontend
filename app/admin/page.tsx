"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { supabase } from "@/lib/supabase"

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Task {
  id: string
  title: string
  description: string
  status: "pending" | "completed"
  created_by: string | null
  assigned_to: string | null
  created_at: string
  priority?: Priority
  due_date?: string
}

interface User {
  id: string
  email: string
  name: string
  is_admin?: boolean
}

type Priority = "low" | "medium" | "high" | "urgent"
type TaskFilter = "all" | "pending" | "completed"
type AssignerStep = 1 | 2 | 3   // 1=pick user, 2=task details, 3=success

/* ── Priority config ─────────────────────────────────────────────────────── */
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; icon: string }> = {
  low:    { label: "Low",    color: "#64748b", bg: "rgba(100,116,139,0.12)", icon: "→" },
  medium: { label: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "↑" },
  high:   { label: "High",   color: "#f97316", bg: "rgba(249,115,22,0.12)",  icon: "↑↑" },
  urgent: { label: "Urgent", color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "🔥" },
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function avatarColor(id: string): string {
  const colors = [
    "linear-gradient(135deg,#6366f1,#8b5cf6)",
    "linear-gradient(135deg,#06b6d4,#3b82f6)",
    "linear-gradient(135deg,#10b981,#059669)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#ec4899,#8b5cf6)",
    "linear-gradient(135deg,#14b8a6,#6366f1)",
  ]
  const idx = id.charCodeAt(0) % colors.length
  return colors[idx]
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function AdminPanel() {
  const router = useRouter()

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users,       setUsers]       = useState<User[]>([])
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [syncing,     setSyncing]     = useState(true)

  /* ── Task assigner modal state ── */
  const [modalOpen,    setModalOpen]    = useState(false)
  const [assignStep,   setAssignStep]   = useState<AssignerStep>(1)
  const [pickedUser,   setPickedUser]   = useState<User | null>(null)
  const [taskTitle,    setTaskTitle]    = useState("")
  const [taskDesc,     setTaskDesc]     = useState("")
  const [taskPriority, setTaskPriority] = useState<Priority>("medium")
  const [taskDueDate,  setTaskDueDate]  = useState("")
  const [assigning,    setAssigning]    = useState(false)
  const [assignError,  setAssignError]  = useState<string | null>(null)
  const [lastAssigned, setLastAssigned] = useState<{ user: string; task: string } | null>(null)

  /* ── Table actions ── */
  const [completing,   setCompleting]   = useState<string | null>(null)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [taskFilter,   setTaskFilter]   = useState<TaskFilter>("all")

  /* ── Auth + admin guard ─────────────────────────────────────────────── */
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/"); return }

      const me: User = {
        id:    session.user.id,
        email: session.user.email ?? "",
        name:  session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.email ?? "Unknown",
      }
      try { await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/sync`, { id: me.id, email: me.email, name: me.name }) }
      catch { /* silent */ }

      try {
        const res = await axios.get<User[]>(`${process.env.NEXT_PUBLIC_API_URL}/users`)
        const found = res.data.find((u) => u.id === me.id)
        if (!found?.is_admin) { router.push("/dashboard"); return }
        me.is_admin = true
        setUsers(res.data)
      } catch { router.push("/dashboard"); return }

      setCurrentUser(me)
      setSyncing(false)
    }
    init()
  }, [router])

  /* ── Data fetching ──────────────────────────────────────────────────── */
  const fetchTasks = useCallback(async () => {
    try {
      const res = await axios.get<Task[]>(`${process.env.NEXT_PUBLIC_API_URL}/tasks`)
      setTasks(res.data)
    } catch { /* silent */ }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get<User[]>(`${process.env.NEXT_PUBLIC_API_URL}/users`)
      setUsers(res.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { if (!syncing) fetchTasks() }, [syncing, fetchTasks])

  /* ── Open / close assigner modal ────────────────────────────────────── */
  const openAssigner = (preselect?: User) => {
    setAssignStep(preselect ? 2 : 1)
    setPickedUser(preselect ?? null)
    setTaskTitle("")
    setTaskDesc("")
    setTaskPriority("medium")
    setTaskDueDate("")
    setAssignError(null)
    setModalOpen(true)
  }

  const closeAssigner = () => {
    setModalOpen(false)
    setLastAssigned(null)
  }

  /* ── Step 1: pick user ───────────────────────────────────────────────── */
  const pickUser = (u: User) => {
    setPickedUser(u)
    setAssignStep(2)
  }

  /* ── Step 2: assign task ─────────────────────────────────────────────── */
  const assignTask = async () => {
    if (!taskTitle.trim()) { setAssignError("Task title is required."); return }
    if (!pickedUser || !currentUser) return

    setAssigning(true)
    setAssignError(null)
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, {
        title:            taskTitle.trim(),
        description:      taskDesc.trim(),
        created_by:       currentUser.id,
        created_by_email: currentUser.email,
        created_by_name:  currentUser.name,
        assigned_to:      pickedUser.id,
        assigned_email:   pickedUser.email,
        assigned_name:    pickedUser.name,
        priority:         taskPriority,
        due_date:         taskDueDate || null,
      })
      setLastAssigned({ user: pickedUser.name || pickedUser.email, task: taskTitle.trim() })
      setAssignStep(3)
      await fetchTasks()
      await fetchUsers()
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setAssignError(`Failed: ${err.response.data.error}`)
      } else {
        setAssignError("Failed to assign task. Please try again.")
      }
    } finally {
      setAssigning(false)
    }
  }

  /* ── Complete task ──────────────────────────────────────────────────── */
  const completeTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
    const creatorUser  = task?.created_by  ? userMap[task.created_by]  : null
    const assigneeUser = task?.assigned_to ? userMap[task.assigned_to] : null
    setCompleting(taskId)
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/tasks/${taskId}/complete`, {
        creator_email:  creatorUser?.email  ?? currentUser?.email ?? "",
        creator_name:   creatorUser?.name   ?? currentUser?.name  ?? "there",
        assigned_email: assigneeUser?.email ?? "",
        assigned_name:  assigneeUser?.name  ?? "there",
      })
      await fetchTasks()
    } catch { /* silent */ }
    finally { setCompleting(null) }
  }

  /* ── Delete task ────────────────────────────────────────────────────── */
  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this task? This cannot be undone.")) return
    setDeleting(taskId)
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/tasks/${taskId}`)
      await fetchTasks()
    } catch { /* silent */ }
    finally { setDeleting(null) }
  }

  const logout = async () => { await supabase.auth.signOut(); router.push("/") }

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const userMap      = Object.fromEntries(users.map((u) => [u.id, u]))
  const filteredTasks = tasks.filter((t) => taskFilter === "all" ? true : t.status === taskFilter)
  const totalCount   = tasks.length
  const pendingCount = tasks.filter((t) => t.status === "pending").length
  const doneCount    = tasks.filter((t) => t.status === "completed").length

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (syncing) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">✓ TaskFlow Admin</div>
        <div className="loading-spinner" />
        <span>Verifying admin access…</span>
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="admin-wrap">

      {/* ────────────── Navbar ────────────── */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo-icon">✓</div>
          <span className="nav-brand-name">TaskFlow</span>
          <span className="admin-nav-badge">Admin</span>
        </div>
        <div className="nav-right">
          {currentUser && (
            <div className="nav-user">
              <div className="avatar">{getInitials(currentUser.name)}</div>
              <div className="nav-user-details">
                <span className="nav-user-name">{currentUser.name}</span>
                <span className="nav-user-email">{currentUser.email}</span>
              </div>
            </div>
          )}
          <button id="go-to-dashboard-btn" className="btn-nav-secondary" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <button id="admin-logout-btn" onClick={logout} className="btn-logout">Sign out</button>
        </div>
      </nav>

      <div className="admin-content">

        {/* ────────────── Header ────────────── */}
        <div className="admin-hero-header">
          <div>
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-subtitle">Manage your team, assign tasks, and track progress.</p>
          </div>
          <button
            id="open-assigner-btn"
            className="btn-assign-hero"
            onClick={() => openAssigner()}
          >
            <span className="btn-assign-hero-icon">＋</span>
            Assign Task
          </button>
        </div>

        {/* ────────────── Stats ────────────── */}
        <div className="admin-stats-row">
          <div className="admin-stat">
            <span className="admin-stat-icon" style={{ background: "rgba(99,102,241,0.15)" }}>👥</span>
            <div><div className="admin-stat-value">{users.length}</div><div className="admin-stat-label">Team Members</div></div>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-icon" style={{ background: "rgba(99,102,241,0.15)" }}>📋</span>
            <div><div className="admin-stat-value">{totalCount}</div><div className="admin-stat-label">Total Tasks</div></div>
          </div>
          <div className="admin-stat" style={{ borderColor: "rgba(245,158,11,0.2)" }}>
            <span className="admin-stat-icon" style={{ background: "rgba(245,158,11,0.12)" }}>⏳</span>
            <div><div className="admin-stat-value" style={{ color: "var(--warning)" }}>{pendingCount}</div><div className="admin-stat-label">In Progress</div></div>
          </div>
          <div className="admin-stat" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
            <span className="admin-stat-icon" style={{ background: "rgba(16,185,129,0.12)" }}>✅</span>
            <div><div className="admin-stat-value" style={{ color: "var(--success)" }}>{doneCount}</div><div className="admin-stat-label">Completed</div></div>
          </div>
        </div>

        {/* ────────────── Team Workload ────────────── */}
        <div className="admin-card" style={{ marginBottom: 20 }}>
          <div className="admin-table-header" style={{ marginBottom: 16 }}>
            <h2 className="panel-title" style={{ margin: 0 }}>
              <span className="panel-title-dot" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }} />
              Team Workload
            </h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Click a member to assign a task</span>
          </div>

          {users.length === 0 ? (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <div className="empty-icon">👥</div>
              <p className="empty-title">No team members yet</p>
              <p className="empty-sub">Users appear here once they sign up or sign in.</p>
            </div>
          ) : (
            <div className="workload-grid">
              {users.map((u) => {
                const myTasks   = tasks.filter((t) => t.assigned_to === u.id)
                const myPending = myTasks.filter((t) => t.status === "pending").length
                const myDone    = myTasks.filter((t) => t.status === "completed").length
                const workload  = Math.min(myPending / Math.max(pendingCount, 1), 1)
                return (
                  <button
                    key={u.id}
                    className="workload-card"
                    id={`assign-to-${u.id}`}
                    onClick={() => openAssigner(u)}
                    title={`Assign a task to ${u.name}`}
                  >
                    <div className="workload-card-top">
                      <div
                        className="workload-avatar"
                        style={{ background: avatarColor(u.id) }}
                      >
                        {getInitials(u.name || u.email)}
                      </div>
                      <div className="workload-user-info">
                        <span className="workload-name">
                          {u.name || u.email}
                          {u.is_admin && <span className="role-badge admin">Admin</span>}
                        </span>
                        <span className="workload-email">{u.email}</span>
                      </div>
                      <div className="workload-assign-hint">＋ Assign</div>
                    </div>

                    <div className="workload-bar-wrap">
                      <div className="workload-bar-track">
                        <div
                          className="workload-bar-fill"
                          style={{ width: `${workload * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="workload-counts">
                      <span className="wc-pending">{myPending} pending</span>
                      <span className="wc-done">{myDone} done</span>
                      <span className="wc-total">{myTasks.length} total</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ────────────── All Tasks Table ────────────── */}
        <div className="admin-card">
          <div className="admin-table-header">
            <h2 className="panel-title" style={{ margin: 0 }}>
              <span className="panel-title-dot" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }} />
              All Tasks
              <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                ({filteredTasks.length})
              </span>
            </h2>
            <div className="filter-group">
              {(["all", "pending", "completed"] as const).map((f) => (
                <button key={f} id={`admin-filter-${f}`}
                  className={`filter-pill${taskFilter === f ? " active" : ""}`}
                  onClick={() => setTaskFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="empty-state" style={{ padding: "48px 0" }}>
              <div className="empty-icon">{taskFilter === "completed" ? "🎉" : "📋"}</div>
              <p className="empty-title">No {taskFilter === "all" ? "" : taskFilter} tasks</p>
              <p className="empty-sub">
                {taskFilter === "all" ? "Use the \"Assign Task\" button above to create your first task." : "Switch filter to see other tasks."}
              </p>
            </div>
          ) : (
            <div className="admin-task-table">
              <div className="admin-task-table-head">
                <span>Task</span><span>Assigned To</span><span>Created By</span>
                <span>Date</span><span>Status</span><span>Actions</span>
              </div>
              {filteredTasks.map((task, i) => {
                const assignee = task.assigned_to ? userMap[task.assigned_to] : null
                const creator  = task.created_by  ? userMap[task.created_by]  : null
                const isDone   = task.status === "completed"
                const pri      = (task.priority as Priority) ?? null
                const priCfg   = pri ? PRIORITY_CONFIG[pri] : null

                return (
                  <div key={task.id} className={`admin-task-row${isDone ? " is-done" : ""}`}
                    style={{ animationDelay: `${i * 0.03}s` }}>
                    <div className="admin-task-info">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {priCfg && (
                          <span className="priority-chip" style={{ color: priCfg.color, background: priCfg.bg }}>
                            {priCfg.icon} {priCfg.label}
                          </span>
                        )}
                        <span className="admin-task-title">{task.title}</span>
                      </div>
                      {task.description && <span className="admin-task-desc">{task.description}</span>}
                      {task.due_date && (
                        <span className="due-date-chip">📅 Due {formatDate(task.due_date)}</span>
                      )}
                    </div>

                    <div className="admin-task-user">
                      {assignee ? (
                        <><span className="avatar-sm" style={{ background: avatarColor(assignee.id) }}>{getInitials(assignee.name || assignee.email)}</span><span>{assignee.name || assignee.email}</span></>
                      ) : <span style={{ color: "var(--text-muted)" }}>Unassigned</span>}
                    </div>

                    <div className="admin-task-user">
                      {creator ? (
                        <><span className="avatar-sm muted">{getInitials(creator.name || creator.email)}</span><span>{creator.name || creator.email}</span></>
                      ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </div>

                    <span className="admin-task-date">{formatDate(task.created_at)}</span>
                    <span className={`badge badge-${task.status}`}>{task.status}</span>

                    <div className="admin-task-actions">
                      {!isDone && (
                        <button id={`admin-complete-${task.id}`} className="btn-complete"
                          onClick={() => completeTask(task.id)} disabled={completing === task.id}>
                          {completing === task.id ? "…" : "✓"}
                        </button>
                      )}
                      <button id={`admin-delete-${task.id}`} className="btn-danger-sm"
                        onClick={() => deleteTask(task.id)} disabled={deleting === task.id} title="Delete task">
                        {deleting === task.id ? "…" : "🗑"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TASK ASSIGNER MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="assigner-overlay" onClick={(e) => e.target === e.currentTarget && closeAssigner()}>
          <div className="assigner-modal">

            {/* Header */}
            <div className="assigner-header">
              <div className="assigner-header-left">
                <div className="assigner-logo">✓</div>
                <div>
                  <div className="assigner-title">
                    {assignStep === 1 && "Assign a Task"}
                    {assignStep === 2 && `Assign to ${pickedUser?.name || pickedUser?.email}`}
                    {assignStep === 3 && "Task Assigned!"}
                  </div>
                  <div className="assigner-steps">
                    <span className={`assigner-step-dot${assignStep >= 1 ? " done" : ""}`} />
                    <span className="assigner-step-line" />
                    <span className={`assigner-step-dot${assignStep >= 2 ? " done" : ""}`} />
                    <span className="assigner-step-line" />
                    <span className={`assigner-step-dot${assignStep === 3 ? " done" : ""}`} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                      {assignStep === 1 && "Step 1 of 2 — Select member"}
                      {assignStep === 2 && "Step 2 of 2 — Task details"}
                      {assignStep === 3 && "Done!"}
                    </span>
                  </div>
                </div>
              </div>
              <button className="assigner-close" onClick={closeAssigner} id="close-assigner-btn">✕</button>
            </div>

            {/* ── Step 1: Pick a user ── */}
            {assignStep === 1 && (
              <div className="assigner-body">
                <p className="assigner-prompt">Who would you like to assign a task to?</p>
                {users.length === 0 ? (
                  <div className="empty-state" style={{ padding: "48px 0" }}>
                    <div className="empty-icon">👥</div>
                    <p className="empty-title">No team members yet</p>
                    <p className="empty-sub">Ask your team to sign up first.</p>
                  </div>
                ) : (
                  <div className="assigner-user-grid">
                    {users.map((u) => {
                      const myPending = tasks.filter((t) => t.assigned_to === u.id && t.status === "pending").length
                      const myTotal   = tasks.filter((t) => t.assigned_to === u.id).length
                      return (
                        <button
                          key={u.id}
                          id={`modal-pick-${u.id}`}
                          className="assigner-user-card"
                          onClick={() => pickUser(u)}
                        >
                          <div className="assigner-user-avatar" style={{ background: avatarColor(u.id) }}>
                            {getInitials(u.name || u.email)}
                          </div>
                          <div className="assigner-user-name">
                            {u.name || u.email}
                            {u.is_admin && <span className="role-badge admin">Admin</span>}
                          </div>
                          <div className="assigner-user-email">{u.email}</div>
                          <div className="assigner-user-stats">
                            <span style={{ color: "var(--warning)" }}>{myPending} pending</span>
                            <span>·</span>
                            <span style={{ color: "var(--text-muted)" }}>{myTotal} total</span>
                          </div>
                          <div className="assigner-select-hint">Select →</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Task details ── */}
            {assignStep === 2 && (
              <div className="assigner-body">

                {/* Selected user chip */}
                <div className="assigner-selected-user">
                  <div className="assigner-user-avatar-sm" style={{ background: pickedUser ? avatarColor(pickedUser.id) : "" }}>
                    {pickedUser ? getInitials(pickedUser.name || pickedUser.email) : "?"}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {pickedUser?.name || pickedUser?.email}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pickedUser?.email}</div>
                  </div>
                  <button className="assigner-change-user" onClick={() => setAssignStep(1)}>
                    ← Change
                  </button>
                </div>

                {assignError && (
                  <div className="auth-error-banner" style={{ marginBottom: 16 }}>
                    <span>⚠ {assignError}</span>
                    <button onClick={() => setAssignError(null)}>✕</button>
                  </div>
                )}

                <div className="assigner-form">
                  {/* Title */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="modal-task-title">Task Title *</label>
                    <input
                      id="modal-task-title"
                      className="form-input"
                      placeholder="What needs to be done?"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Description */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="modal-task-desc">Description</label>
                    <textarea
                      id="modal-task-desc"
                      className="form-textarea"
                      placeholder="Add context, requirements, or links…"
                      value={taskDesc}
                      onChange={(e) => setTaskDesc(e.target.value)}
                      style={{ minHeight: 80 }}
                    />
                  </div>

                  {/* Priority + Due date row */}
                  <div className="assigner-two-col">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Priority</label>
                      <div className="priority-picker">
                        {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => {
                          const cfg = PRIORITY_CONFIG[p]
                          return (
                            <button
                              key={p}
                              id={`priority-${p}`}
                              className={`priority-option${taskPriority === p ? " selected" : ""}`}
                              style={taskPriority === p ? { borderColor: cfg.color, background: cfg.bg, color: cfg.color } : {}}
                              onClick={() => setTaskPriority(p)}
                              type="button"
                            >
                              {cfg.icon} {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="modal-due-date">Due Date</label>
                      <input
                        id="modal-due-date"
                        className="form-input"
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    id="modal-assign-btn"
                    className="btn-assign-submit"
                    onClick={assignTask}
                    disabled={assigning}
                  >
                    {assigning ? (
                      <><span className="btn-spinner" /> Assigning task…</>
                    ) : (
                      <>📨 Assign Task &amp; Send Email Notification</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Success ── */}
            {assignStep === 3 && (
              <div className="assigner-body assigner-success">
                <div className="success-burst">🎉</div>
                <h2 className="success-title">Task Assigned!</h2>
                <p className="success-subtitle">
                  <strong>&ldquo;{lastAssigned?.task}&rdquo;</strong> has been assigned to{" "}
                  <strong>{lastAssigned?.user}</strong>.
                </p>
                <p className="success-email-note">
                  📧 An email notification has been sent to the assignee.
                </p>
                <div className="success-actions">
                  <button
                    id="assign-another-btn"
                    className="btn-create"
                    onClick={() => { setAssignStep(1); setPickedUser(null); setTaskTitle(""); setTaskDesc(""); setTaskPriority("medium"); setTaskDueDate(""); setAssignError(null) }}
                  >
                    Assign Another Task
                  </button>
                  <button
                    id="close-success-btn"
                    className="btn-nav-secondary"
                    onClick={closeAssigner}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
