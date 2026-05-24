"use client"

import { useEffect, useState } from "react"
import axios from "axios"

export default function Dashboard() {

  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  const fetchTasks = async () => {
    const res = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/tasks`
    )

    setTasks(res.data)
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const createTask = async () => {

    await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/tasks`,
      {
        title,
        description
      }
    )

    fetchTasks()
  }

  return (
    <div className="p-10">

      <h1 className="text-3xl font-bold mb-5">
        Task Dashboard
      </h1>

      <div className="space-y-3 mb-8">

        <input
          className="border p-2 w-full"
          placeholder="Task title"
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="border p-2 w-full"
          placeholder="Description"
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          onClick={createTask}
          className="bg-blue-500 text-white px-5 py-2"
        >
          Create Task
        </button>

      </div>

      <div className="space-y-4">

        {tasks.map((task: any) => (
          <div
            key={task.id}
            className="border p-4 rounded"
          >
            <h2 className="font-bold">{task.title}</h2>
            <p>{task.description}</p>
            <p>Status: {task.status}</p>
          </div>
        ))}

      </div>
    </div>
  )
}