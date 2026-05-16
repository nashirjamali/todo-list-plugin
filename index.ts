import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import {
  setupOrbitBillingForOpenClawPlugin,
  type OrbitOpenClawPluginApi,
} from "@orbit-0g/sdk";
import { definePluginEntry, jsonResult } from "openclaw/plugin-sdk/core";

type Todo = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

const todosFile = path.join(
  (process.env.OPENCLAW_STATE_DIR ?? "").trim() || path.join(os.homedir(), ".openclaw"),
  "plugins",
  "todo-list-plugin",
  "todos.json",
);

function ensureDataDir() {
  fs.mkdirSync(path.dirname(todosFile), { recursive: true });
}

function loadTodos(): Todo[] {
  try {
    const raw = fs.readFileSync(todosFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Todo[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]) {
  ensureDataDir();
  fs.writeFileSync(todosFile, JSON.stringify(todos, null, 2));
}

function findTodo(todos: Todo[], id: string): Todo | undefined {
  return todos.find((t) => t.id === id);
}

const addParams = Type.Object({
  title: Type.String({ description: "Todo title" }),
  description: Type.Optional(Type.String({ description: "Optional details" })),
});

const getParams = Type.Object({
  id: Type.Optional(Type.String({ description: "Todo id; omit to list all todos" })),
});

const updateParams = Type.Object({
  id: Type.String({ description: "Todo id to update" }),
  title: Type.Optional(Type.String({ description: "New title" })),
  description: Type.Optional(Type.String({ description: "New description" })),
  completed: Type.Optional(Type.Boolean({ description: "Mark completed or incomplete" })),
});

const removeParams = Type.Object({
  id: Type.String({ description: "Todo id to remove" }),
});

export default definePluginEntry({
  id: "todo-list-plugin",
  name: "todo-list-plugin",
  description: "Add, list, update, and remove todos in OpenClaw",
  register(api) {
    setupOrbitBillingForOpenClawPlugin(api as OrbitOpenClawPluginApi, import.meta.url);

    api.registerTool({
      name: "todo_list_add",
      label: "Add todo",
      description: "Add a new item to the todo list",
      parameters: addParams,
      async execute(_id, params) {
        const p = params as Static<typeof addParams>;
        const now = new Date().toISOString();
        const todo: Todo = {
          id: randomUUID(),
          title: p.title.trim(),
          description: (p.description ?? "").trim(),
          completed: false,
          createdAt: now,
          updatedAt: now,
        };
        const todos = loadTodos();
        todos.push(todo);
        saveTodos(todos);
        return jsonResult({ ok: true, todo });
      },
    });

    api.registerTool({
      name: "todo_list_get",
      label: "Get todos",
      description: "List all todos or get one todo by id",
      parameters: getParams,
      async execute(_id, params) {
        const p = params as Static<typeof getParams>;
        const todos = loadTodos();
        if (p.id) {
          const todo = findTodo(todos, p.id);
          if (!todo) {
            return jsonResult({ ok: false, error: `Todo not found: ${p.id}` });
          }
          return jsonResult({ ok: true, todo });
        }
        return jsonResult({ ok: true, todos, count: todos.length });
      },
    });

    api.registerTool({
      name: "todo_list_update",
      label: "Update todo",
      description: "Update a todo title, description, or completed status",
      parameters: updateParams,
      async execute(_id, params) {
        const p = params as Static<typeof updateParams>;
        const todos = loadTodos();
        const todo = findTodo(todos, p.id);
        if (!todo) {
          return jsonResult({ ok: false, error: `Todo not found: ${p.id}` });
        }
        if (p.title !== undefined) todo.title = p.title.trim();
        if (p.description !== undefined) todo.description = p.description.trim();
        if (p.completed !== undefined) todo.completed = p.completed;
        todo.updatedAt = new Date().toISOString();
        saveTodos(todos);
        return jsonResult({ ok: true, todo });
      },
    });

    api.registerTool({
      name: "todo_list_remove",
      label: "Remove todo",
      description: "Remove a todo from the list by id",
      parameters: removeParams,
      async execute(_id, params) {
        const p = params as Static<typeof removeParams>;
        const todos = loadTodos();
        const index = todos.findIndex((t) => t.id === p.id);
        if (index === -1) {
          return jsonResult({ ok: false, error: `Todo not found: ${p.id}` });
        }
        const [removed] = todos.splice(index, 1);
        saveTodos(todos);
        return jsonResult({ ok: true, removed });
      },
    });
  },
});
