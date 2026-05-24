"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { supabase } from "@/lib/supabase"

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface Task {
  id: string
  title: string
  description: string
  status: "pending" | "completed"
  created_by: string | null
  assigned_to: string | null
  created_at: string
}

interface User {
  id: string
  email: string
  name: string
  is_admin?: boolean
}

type FilterType = "all" | "pending" | "completed"

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const router = useRouter()

  const [tasks,       setTasks]       = useState<Task[]>([])
  const [users,       setUsers]       = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isAdmin,     setIsAdmin]     = useState(false)

  const [loading,    setLoading]    = useState(false)
  const [syncing,    setSyncing]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<FilterType>("all")
  const [completing, setCompleting] = useState<string | null>(null)

  /* ── Auth init + user sync ─────────────────────────────────────────────── */
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/"); return }

      const me: User = {
        id:    session.user.id,
        email: session.user.email ?? "",
        name:
          session.user.user_metadata?.full_name ??
          session.user.user_metadata?.name ??
          session.user.email ??
          "Unknown",
      }
      setCurrentUser(me)

      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/sync`, {
          id:    me.id,
          email: me.email,
          name:  me.name,
        })
      } catch (e) {
        console.warn("User sync:", e)
      }

      // Fetch users to check admin status
      try {
        const res = await axios.get<User[]>(`${process.env.NEXT_PUBLIC_API_URL}/users`)
        setUsers(res.data)
        const found = res.data.find((u) => u.id === me.id)
        if (found?.is_admin) {
          setIsAdmin(true)
          me.is_admin = true
          setCurrentUser({ ...me, is_admin: true })
        }
      } catch { /* silent */ }

      setSyncing(false)
    }
    init()
  }, [router])

  /* ── Data fetching — only tasks assigned to current user ─────────────── */
  const fetchTasks = useCallback(async (userId: string) => {
    try {
      // Regular users see only their assigned tasks; admins see all
      const url = `${process.env.NEXT_PUBLIC_API_URL}/tasks?assigned_to=${userId}`
      const res = await axios.get<Task[]>(url)
      setTasks(res.data)
    } catch {
      setError("Could not load tasks. Is the backend running?")
    }
  }, [])

  useEffect(() => {
    if (currentUser && !syncing) {
      fetchTasks(currentUser.id)
    }
  }, [currentUser, syncing, fetchTasks])

  /* ── Complete task ─────────────────────────────────────────────────────── */
  const completeTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))
    const creatorUser  = task?.created_by  ? userMap[task.created_by]  : null
    const assigneeUser = task?.assigned_to ? userMap[task.assigned_to] : null

    setCompleting(taskId)
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/tasks/${taskId}/complete`, {
        creator_email:  creatorUser?.email  ?? currentUser?.email  ?? "",
        creator_name:   creatorUser?.name   ?? currentUser?.name   ?? "there",
        assigned_email: assigneeUser?.email ?? "",
        assigned_name:  assigneeUser?.name  ?? "there",
      })
      if (currentUser) await fetchTasks(currentUser.id)
    } catch {
      setError("Failed to mark task as complete.")
    } finally {
      setCompleting(null)
    }
  }

  /* ── Logout ────────────────────────────────────────────────────────────── */
  const logout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  /* ── Derived data ──────────────────────────────────────────────────────── */
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const filteredTasks = tasks.filter((t) =>
    filter === "all" ? true : t.status === filter
  )

  const totalCount    = tasks.length
  const pendingCount  = tasks.filter((t) => t.status === "pending").length
  const doneCount     = tasks.filter((t) => t.status === "completed").length

  /* ── Loading screen ────────────────────────────────────────────────────── */
  if (syncing) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">✓ TaskFlow</div>
        <div className="loading-spinner" />
        <span>Setting up your workspace…</span>
      </div>
    )
  }

  /* ── Main render ───────────────────────────────────────────────────────── */
  return (
    <div className="dashboard-wrap">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo-icon">✓</div>
          <span className="nav-brand-name">TaskFlow</span>
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
          {isAdmin && (
            <button
              id="go-to-admin-btn"
              className="btn-admin-nav"
              onClick={() => router.push("/admin")}
            >
              ⚙ Admin Panel
            </button>
          )}
          <button id="logout-btn" onClick={logout} className="btn-logout">
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="dashboard-content">

        {/* Page header */}
        <div className="page-header">
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">
            {currentUser
              ? `Welcome back, ${currentUser.name.split(" ")[0]}! Here are the tasks assigned to you.`
              : "View and manage tasks assigned to you."}
          </p>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon all">📋</div>
            <div className="stat-info">
              <span className="stat-value">{totalCount}</span>
              <span className="stat-label">My Tasks</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon pending">⏳</div>
            <div className="stat-info">
              <span className="stat-value">{pendingCount}</span>
              <span className="stat-label">In Progress</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon completed">✅</div>
            <div className="stat-info">
              <span className="stat-value">{doneCount}</span>
              <span className="stat-label">Completed</span>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="error-banner" style={{ marginBottom: 24 }}>
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Task List */}
        <div className="task-panel">
          <div className="task-panel-header">
            <h2 className="task-panel-title">
              Assigned to Me
              {filteredTasks.length > 0 && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "14px", marginLeft: "8px" }}>
                  ({filteredTasks.length})
                </span>
              )}
            </h2>

            <div className="filter-group">
              {(["all", "pending", "completed"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  className={`filter-pill${filter === f ? " active" : ""}`}
                  onClick={() => setFilter(f)}
                  id={`filter-${f}`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="task-list">
            {filteredTasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  {filter === "completed" ? "🎉" : filter === "pending" ? "⏳" : "📋"}
                </div>
                <p className="empty-title">
                  {filter === "all"
                    ? "No tasks assigned to you yet"
                    : `No ${filter} tasks`}
                </p>
                <p className="empty-sub">
                  {filter === "all"
                    ? "Your admin will assign tasks to you. You'll receive an email when a task is assigned."
                    : "Switch to a different filter to see other tasks."}
                </p>
              </div>
            ) : (
              filteredTasks.map((task, i) => {
                const assignedUser  = task.assigned_to ? userMap[task.assigned_to] : null
                const createdByUser = task.created_by  ? userMap[task.created_by]  : null
                const isDone = task.status === "completed"

                return (
                  <div
                    key={task.id}
                    className={`task-card${isDone ? " is-done" : ""}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    {/* Top row */}
                    <div className="task-card-top">
                      <div className="task-card-body">
                        <h3 className="task-title">{task.title}</h3>
                        {task.description && (
                          <p className="task-desc">{task.description}</p>
                        )}
                      </div>
                      <span className={`badge badge-${task.status}`}>
                        {task.status}
                      </span>
                    </div>

                    {/* Footer */}
                    <div className="task-card-footer">
                      {assignedUser && (
                        <div className="task-meta-item">
                          <span className="avatar-sm">
                            {getInitials(assignedUser.name)}
                          </span>
                          <span className="task-meta-label">Assigned to</span>
                          <span className="task-meta-val">{assignedUser.name}</span>
                        </div>
                      )}

                      {createdByUser && createdByUser.id !== assignedUser?.id && (
                        <div className="task-meta-item">
                          <span className="avatar-sm muted">
                            {getInitials(createdByUser.name)}
                          </span>
                          <span className="task-meta-label">by</span>
                          <span className="task-meta-val">{createdByUser.name}</span>
                        </div>
                      )}

                      <span className="task-date">{formatDate(task.created_at)}</span>

                      {!isDone && (
                        <button
                          id={`complete-${task.id}`}
                          className="btn-complete"
                          onClick={() => completeTask(task.id)}
                          disabled={completing === task.id || loading}
                          style={{ marginLeft: "auto" }}
                        >
                          {completing === task.id ? (
                            <span style={{ opacity: 0.7 }}>Saving…</span>
                          ) : (
                            <><span>✓</span> Mark Complete</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}