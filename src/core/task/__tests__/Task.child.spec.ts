// npx vitest core/task/__tests__/Task.child.spec.ts

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { TaskCreationOptions } from "../task-types"
import * as vscode from "vscode"
import { TelemetryService } from "@roo-code/telemetry"
import { ContextProxy } from "../../config/ContextProxy"

vi.mock("vscode", () => ({
	...vi.importActual("vscode"),
	RelativePattern: vi.fn().mockImplementation((base, pattern) => ({
		base,
		pattern,
	})),
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({
			key: "mock-decoration-type",
			dispose: vi.fn(),
		})),
		tabGroups: {
			onDidChangeTabs: vi.fn(),
			all: [],
		},
	},
	commands: {
		executeCommand: vi.fn(),
	},
	env: {
		language: "en",
	},
	workspace: {
		workspaceFolders: [],
		getConfiguration: () => ({
			get: () => ({}),
		}),
		createFileSystemWatcher: vi.fn(() => ({
			onDidChange: vi.fn(),
			onDidCreate: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}))

describe("Task Child Task Management", () => {
	let provider: ClineProvider
	let parentTask: Task

	beforeEach(async () => {
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		let taskHistory: any[] = [] // Stateful history

		const mockContext = {
			extensionPath: "/mock/path",
			globalState: {
				get: (key: string) => {
					if (key === "taskHistory") {
						return taskHistory
					}
					return undefined
				},
				update: (key: string, value: any) => {
					if (key === "taskHistory") {
						taskHistory = value
					}
					return Promise.resolve()
				},
			},
			globalStorageUri: {
				fsPath: "/mock/storage/uri",
			},
		} as any

		provider = new ClineProvider(
			mockContext,
			{ appendLine: vi.fn() } as any,
			"sidebar",
			new ContextProxy(mockContext),
		)

		const parentTaskOptions: TaskCreationOptions = {
			provider,
			apiConfiguration: { apiProvider: "anthropic" },
			task: "Parent task prompt",
			globalStoragePath: "/mock/storage",
			startTask: false, // Explicitly do not start the task
		}
		parentTask = new Task(parentTaskOptions)
		await parentTask.initializeEmptyTask()

		const parentHistoryItem = {
			id: parentTask.taskId,
			ts: Date.now(),
			task: "Parent task prompt",
			status: "finished",
			pendingChildTasks: [],
			childTaskIds: [],
			activeChildTaskId: undefined,
		}

		taskHistory = [parentHistoryItem] // Initialize the stateful history

		provider.clineStack.push(parentTask)
	}, 10000)

	test("should create a new child task and add it to the pending list", async () => {
		const childPrompt = "This is a child task"
		const childFiles = ["/path/to/file1.ts", "/path/to/file2.ts"]

		await parentTask.executeNewChildTaskTool([{ prompt: childPrompt, files: childFiles }], false)

		expect(parentTask.pendingChildTasks).toHaveLength(1)
		const pendingTask = parentTask.pendingChildTasks[0]
		expect(pendingTask?.prompt).toBe(childPrompt)
		expect(pendingTask?.files).toEqual(childFiles)
	}, 10000)

	test("should start the next pending child task", async () => {
		const childPrompt = "This is a child task to be executed"
		const childFiles: string[] = []
		await parentTask.executeNewChildTaskTool([{ prompt: childPrompt, files: childFiles }], false)

		const mockChildTask = new Task({
			provider,
			apiConfiguration: { apiProvider: "anthropic" },
			task: "mock child task",
			globalStoragePath: "/mock/storage",
			startTask: false,
		})
		const initClineWithSubTaskSpy = vi.spyOn(provider, "initClineWithSubTask").mockResolvedValue(mockChildTask)

		await parentTask.startNextChildTaskTool()

		expect(parentTask.pendingChildTasks).toHaveLength(0)
		expect(initClineWithSubTaskSpy).toHaveBeenCalledWith(parentTask, childPrompt, childFiles)
		expect(parentTask.activeChildTask).toBeDefined()
		expect(parentTask.activeChildTask?.taskId).toBe(mockChildTask.taskId)
	}, 10000)

	test("should create and execute a child task immediately", async () => {
		const childPrompt = "This is an immediate child task"
		const childFiles = ["/path/to/immediate.ts"]

		// Ensure the spy is on the actual implementation
		const initClineWithSubTaskSpy = vi.spyOn(provider, "initClineWithSubTask")

		const childTask = await parentTask.executeNewChildTaskTool([{ prompt: childPrompt, files: childFiles }], true)

		expect(initClineWithSubTaskSpy).toHaveBeenCalledWith(parentTask, childPrompt, childFiles)

		// The new child task should be on top of the stack
		const currentTask = provider.getCurrentCline()
		expect(currentTask?.taskId).toBe((childTask as Task).taskId)
		expect(currentTask?.parentTask?.taskId).toBe(parentTask.taskId)
	}, 10000)
})
