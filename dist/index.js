import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { createOrbitSdk, ensureOrbitWalletForOpenClaw, registerOrbitUserBilling, } from "@orbit-0g/sdk";
import { definePluginEntry, jsonResult } from "openclaw/plugin-sdk/core";
const orbitPluginIdRaw = (process.env.ORBIT_PLUGIN_ID ?? "").trim();
const orbitPluginId = orbitPluginIdRaw ? orbitPluginIdRaw : null;
let orbitSdk = null;
let orbitInstallRecorded = false;
const todosFile = path.join((process.env.OPENCLAW_STATE_DIR ?? "").trim() || path.join(os.homedir(), ".openclaw"), "plugins", "todo-list-plugin", "todos.json");
function ensureDataDir() {
    fs.mkdirSync(path.dirname(todosFile), { recursive: true });
}
function loadTodos() {
    try {
        const raw = fs.readFileSync(todosFile, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function saveTodos(todos) {
    ensureDataDir();
    fs.writeFileSync(todosFile, JSON.stringify(todos, null, 2));
}
function findTodo(todos, id) {
    return todos.find((t) => t.id === id);
}
function getOrbitSdk() {
    if (!orbitSdk) {
        orbitSdk = createOrbitSdk({ privateKey: process.env.PRIVATE_KEY });
    }
    return orbitSdk;
}
async function chargeOrbitForTool(toolName, pluginConfig) {
    if (!orbitPluginId)
        return;
    await ensureOrbitWalletForOpenClaw({ pluginConfig });
    const sdk = getOrbitSdk();
    if (!orbitInstallRecorded && process.env.ORBIT_BILLING_RECORD_INSTALL === "1") {
        await sdk.billing.recordInstall(orbitPluginId);
        orbitInstallRecorded = true;
    }
    console.log("RECORDING USAGE", orbitPluginId, toolName);
    await sdk.billing.recordUsage(orbitPluginId, toolName);
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
        registerOrbitUserBilling(api);
        api.registerTool({
            name: "todo_list_add",
            label: "Add todo",
            description: "Add a new item to the todo list",
            parameters: addParams,
            async execute(_id, params) {
                const p = params;
                await chargeOrbitForTool("todo_list_add", api.pluginConfig);
                const now = new Date().toISOString();
                const todo = {
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
                const p = params;
                await chargeOrbitForTool("todo_list_get", api.pluginConfig);
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
                const p = params;
                await chargeOrbitForTool("todo_list_update", api.pluginConfig);
                const todos = loadTodos();
                const todo = findTodo(todos, p.id);
                if (!todo) {
                    return jsonResult({ ok: false, error: `Todo not found: ${p.id}` });
                }
                if (p.title !== undefined)
                    todo.title = p.title.trim();
                if (p.description !== undefined)
                    todo.description = p.description.trim();
                if (p.completed !== undefined)
                    todo.completed = p.completed;
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
                const p = params;
                await chargeOrbitForTool("todo_list_remove", api.pluginConfig);
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
