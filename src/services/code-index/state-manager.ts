import * as vscode from "vscode"

export type IndexingState = "Standby" | "Indexing" | "Indexed" | "Error"

export class CodeIndexStateManager {
	private _systemStatus: IndexingState = "Standby"
	private _statusMessage: string = ""
	private _processedItems: number = 0
	private _totalItems: number = 0
	private _currentItemUnit: string = "blocks"
	private _currentApiKey: number = 0
	private _totalApiKeys: number = 0
	private _progressEmitter = new vscode.EventEmitter<ReturnType<typeof this.getCurrentStatus>>()

	// --- Public API ---

	public readonly onProgressUpdate = this._progressEmitter.event

	public get state(): IndexingState {
		return this._systemStatus
	}

	public getCurrentStatus() {
		return {
			systemStatus: this._systemStatus,
			message: this._statusMessage,
			processedItems: this._processedItems,
			totalItems: this._totalItems,
			currentItemUnit: this._currentItemUnit,
			currentApiKey: this._currentApiKey,
			totalApiKeys: this._totalApiKeys,
		}
	}

	// --- State Management ---

	public setSystemState(newState: IndexingState, message?: string): void {
		const stateChanged =
			newState !== this._systemStatus || (message !== undefined && message !== this._statusMessage)

		if (stateChanged) {
			this._systemStatus = newState
			if (message !== undefined) {
				this._statusMessage = message
			}

			// Reset progress counters if moving to a non-indexing state or starting fresh
			if (newState !== "Indexing") {
				this._processedItems = 0
				this._totalItems = 0
				this._currentItemUnit = "blocks" // Reset to default unit
				this._currentApiKey = 0
				this._totalApiKeys = 0
				// Optionally clear the message or set a default for non-indexing states
				if (newState === "Standby" && message === undefined) this._statusMessage = "Ready."
				if (newState === "Indexed" && message === undefined) this._statusMessage = "Index up-to-date."
				if (newState === "Error" && message === undefined) this._statusMessage = "An error occurred."
			}

			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public reportBlockIndexingProgress(processedItems: number, totalItems: number): void {
		const progressChanged = processedItems !== this._processedItems || totalItems !== this._totalItems
		const oldMessage = this._statusMessage

		const unit = totalItems === 1 ? "block" : "blocks"
		const newMessage = `Indexed ${processedItems} / ${totalItems} ${unit} found`

		const shouldUpdate = progressChanged || this._systemStatus !== "Indexing" || newMessage !== oldMessage

		if (shouldUpdate) {
			this._processedItems = processedItems
			this._totalItems = totalItems
			this._currentItemUnit = "blocks"
			this._systemStatus = "Indexing"
			this._statusMessage = newMessage

			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public reportFileQueueProgress(processedFiles: number, totalFiles: number, currentFileBasename?: string): void {
		const progressChanged = processedFiles !== this._processedItems || totalFiles !== this._totalItems
		const oldMessage = this._statusMessage

		// This MUST be set before the message is constructed.
		const unit = totalFiles === 1 ? "file" : "files"
		let newMessage: string

		if (totalFiles > 0 && processedFiles === 0) {
			newMessage = `Found ${totalFiles} ${unit} to process.`
		} else if (totalFiles > 0 && processedFiles < totalFiles) {
			newMessage = `Processing ${processedFiles} / ${totalFiles} ${unit}. Current: ${
				currentFileBasename || "..."
			}`
		} else {
			// When processing is complete (processed === total), we don't generate a "finished" message here.
			// The orchestrator will call reportBlockIndexingProgress immediately after, which provides a more
			// accurate final status before transitioning to "Indexed".
			// If we are in a weird state, just keep the last message.
			newMessage = this._statusMessage
		}

		const shouldUpdate = progressChanged || this._systemStatus !== "Indexing" || newMessage !== oldMessage

		if (shouldUpdate) {
			this._processedItems = processedFiles
			this._totalItems = totalFiles
			this._currentItemUnit = "files" // Set state unit
			this._systemStatus = "Indexing"
			this._statusMessage = newMessage

			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public reportApiKeyUsage(current: number, total: number): void {
		if (this._currentApiKey !== current || this._totalApiKeys !== total) {
			this._currentApiKey = current
			this._totalApiKeys = total
			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public dispose(): void {
		this._progressEmitter.dispose()
	}
}
