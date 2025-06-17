// @jest-environment node
import * as vscode from "vscode"
import { DiffViewProvider } from "../DiffViewProvider"

// Mock vscode
vi.mock("vscode", async () => {
	const actualVscode = await vi.importActual<typeof vscode>("vscode")
	return {
		...actualVscode,
		workspace: {
			applyEdit: vi.fn(),
			getConfiguration: vi.fn(),
		},
		window: {
			createTextEditorDecorationType: vi.fn(),
			tabGroups: { all: [] },
			visibleTextEditors: [],
			onDidChangeActiveTextEditor: vi.fn(),
			showTextDocument: vi.fn(),
		},
		commands: {
			executeCommand: vi.fn(),
		},
		Uri: {
			...actualVscode.Uri,
			parse: vi.fn((value: string) => ({
				scheme: "file",
				path: value,
				with: vi.fn((options) => ({
					...options,
					scheme: options.scheme || "file",
					path: options.path || value,
				})),
			})),
		},
		WorkspaceEdit: vi.fn().mockImplementation(() => ({
			replace: vi.fn(),
			delete: vi.fn(),
		})),
		Range: vi.fn(),
		Position: vi.fn(),
		Selection: vi.fn(),
		ViewColumn: { Beside: 2 },
		TextEditorRevealType: { AtTop: 1, InCenter: 2 },
	}
})

// mock cline provider
vi.mock("../../../core/webview/ClineProvider", () => ({
	__esModule: true,
	ClineProvider: {
		// This is the inner ClineProvider object/class
		getVisibleInstance: vi.fn(() => ({
			getValue: vi.fn((key: string) => {
				if (key === "autoApprovalEnabled") return true
				if (key === "alwaysAllowWrite") return true
				return undefined
			}),
		})),
	},
}))

// Mock DecorationController
vi.mock("../DecorationController", () => ({
	DecorationController: vi.fn().mockImplementation(() => ({
		setActiveLine: vi.fn(),
		updateOverlayAfterLine: vi.fn(),
		clear: vi.fn(),
	})),
}))

describe("DiffViewProvider", () => {
	const cwd = "/mock"
	const relPath = "file.txt"
	let provider: DiffViewProvider

	beforeEach(() => {
		vi.clearAllMocks()
		provider = new DiffViewProvider(cwd)
		provider["relPath"] = relPath
		provider["editType"] = "modify"
		provider["originalContent"] = "original"
	})

	it("should pass preserveFocus: false when autoFocus is true", async () => {
		const mockConfig = {
			get: vi.fn((key: string) => {
				if (key === "diffViewAutoFocus") return true
				if (key === "autoCloseRooTabs") return true
				if (key === "autoCloseAllRooTabs") return false
				return undefined
			}),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

		const executeCommand = vi.mocked(vscode.commands.executeCommand)
		executeCommand.mockResolvedValue(undefined)

		await provider["initialize"]()

		const promise = provider["openDiffEditor"]()

		await promise.catch((error: any) => {
			// This is expected to fail because the editor is not activated, we just want to test the command
			console.error("Error:", error)
		})

		expect(executeCommand).toHaveBeenCalledWith(
			"vscode.diff",
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ preserveFocus: false, preview: false, viewColumn: -1 }),
		)
	})

	it("should pass preserveFocus: true when autoFocus is false", async () => {
		const mockConfig = {
			get: vi.fn((key: string) => {
				if (key === "diffViewAutoFocus") return false
				if (key === "autoCloseRooTabs") return true
				if (key === "autoCloseAllRooTabs") return false
				return undefined
			}),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any)

		const executeCommand = vi.mocked(vscode.commands.executeCommand)
		executeCommand.mockResolvedValue(undefined)

		await provider["initialize"]()

		const promise = provider["openDiffEditor"]()

		await promise.catch((error: any) => {
			// This is expected to fail because the editor is not activated, we just want to test the command
			console.error("Error:", error)
		})

		expect(executeCommand).toHaveBeenCalledWith(
			"vscode.diff",
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ preserveFocus: true, preview: false, viewColumn: -1 }),
		)
	})

	it("should properly initialize UserInteractionProvider", () => {
		expect(provider).toBeDefined()
		expect((provider as any).userInteractionProvider).toBeDefined()
	})

	it("should update UserInteractionProvider options when disabling auto focus", async () => {
		await provider["initialize"]()

		// Mock the provider's enable method to verify it's called
		const enableSpy = vi.spyOn((provider as any).userInteractionProvider, "enable")

		provider.disableAutoFocusAfterUserInteraction()

		expect(enableSpy).toHaveBeenCalled()
	})
})
