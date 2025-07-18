import * as vscode from "vscode"
import * as path from "path"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager, IndexingState } from "./state-manager"
import { IFileWatcher, IVectorStore, BatchProcessingSummary } from "./interfaces"
import { DirectoryScanner } from "./processors"
import { CacheManager } from "./cache-manager"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

/**
 * Manages the code indexing workflow, coordinating between different services and managers.
 */
export class CodeIndexOrchestrator {
	private _fileWatcherSubscriptions: vscode.Disposable[] = []
	private _isProcessing: boolean = false
	private _batchHasError: boolean = false

	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		private readonly workspacePath: string,
		private readonly cacheManager: CacheManager,
		private readonly vectorStore: IVectorStore,
		private readonly scanner: DirectoryScanner,
		private readonly fileWatcher: IFileWatcher,
	) {}

	/**
	 * Starts the file watcher if not already running.
	 */
	private async _startWatcher(): Promise<void> {
		if (!this.configManager.isFeatureConfigured) {
			throw new Error("Cannot start watcher: Service not configured.")
		}

		this.stateManager.setSystemState("Indexing", "Initializing file watcher...")

		try {
			await this.fileWatcher.initialize()

			this._fileWatcherSubscriptions = [
				this.fileWatcher.onDidStartBatchProcessing(() => {
					this._batchHasError = false // Reset error flag for new batch
				}),
				this.fileWatcher.onBatchProgressUpdate(({ processedInBatch, totalInBatch, currentFile }) => {
					if (totalInBatch > 0 && this.stateManager.state !== "Indexing") {
						this.stateManager.setSystemState("Indexing", "Processing file changes...")
					}
					this.stateManager.reportFileQueueProgress(
						processedInBatch,
						totalInBatch,
						currentFile ? path.basename(currentFile) : undefined,
					)
				}),
				this.fileWatcher.onDidFinishBatchProcessing((summary: BatchProcessingSummary) => {
					if (summary.batchError) {
						this._batchHasError = true
						const errorMessage =
							summary.batchError instanceof Error
								? summary.batchError.message
								: String(summary.batchError)
						this.stateManager.setSystemState("Error", `Batch processing failed: ${errorMessage}`)
					} else if (this.stateManager.state === "Indexing") {
						// If a batch finished without error, and we were in an indexing state, mark as complete.
						this.stateManager.setSystemState("Indexed", "Index up-to-date. File queue processed.")
					}
				}),
			]
		} catch (error) {
			console.error("[CodeIndexOrchestrator] Failed to start file watcher:", error)
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "_startWatcher",
			})
			throw error
		}
	}

	/**
	 * Updates the status of a file in the state manager.
	 */

	/**
	 * Initiates the indexing process (initial scan and starts watcher).
	 */
	public async startIndexing(): Promise<void> {
		if (!this.configManager.isFeatureConfigured) {
			this.stateManager.setSystemState("Standby", "Missing configuration. Save your settings to start indexing.")
			console.warn("[CodeIndexOrchestrator] Start rejected: Missing configuration.")
			return
		}

		if (
			this._isProcessing ||
			(this.stateManager.state !== "Standby" &&
				this.stateManager.state !== "Error" &&
				this.stateManager.state !== "Indexed")
		) {
			console.warn(
				`[CodeIndexOrchestrator] Start rejected: Already processing or in state ${this.stateManager.state}.`,
			)
			return
		}

		this._isProcessing = true
		this.stateManager.setSystemState("Indexing", "Initializing services...")

		try {
			const collectionCreated = await this.vectorStore.initialize()

			if (collectionCreated) {
				await this.cacheManager.clearCacheFile()
			}

			this.stateManager.setSystemState("Indexing", "Services ready. Starting workspace scan...")

			let batchErrors: Error[] = []
			let cumulativeBlocksIndexed = 0
			let totalBlocksFound = 0 // Will be determined by the scanner
			let processedFiles = 0

			const handleFileProgress = (currentFile: string, currentFileNumber: number, totalFileCount: number) => {
				processedFiles = currentFileNumber
				this.stateManager.reportFileQueueProgress(
					currentFileNumber,
					totalFileCount,
					currentFile ? path.basename(currentFile) : undefined,
				)
			}

			const handleBlocksIndexed = (indexedCount: number) => {
				cumulativeBlocksIndexed += indexedCount
				if (totalBlocksFound > 0) {
					this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, totalBlocksFound)
				}
			}

			const handleBlockProcessingStart = (totalBlocks: number) => {
				totalBlocksFound = totalBlocks
				this.stateManager.reportBlockIndexingProgress(0, totalBlocks)
			}

			const result = await this.scanner.scanDirectory(
				this.workspacePath,
				(batchError: Error) => {
					console.error(
						`[CodeIndexOrchestrator] Error during initial scan batch: ${batchError.message}`,
						batchError,
					)
					batchErrors.push(batchError)
				},
				handleBlocksIndexed,
				undefined,
				handleFileProgress,
				handleBlockProcessingStart,
			)

			if (!result) {
				throw new Error("Scan failed, is scanner initialized?")
			}

			const { stats } = result
			totalBlocksFound = stats.totalBlocksIndexed

			// After the file scan is complete, we now report the collected blocks.
			this.stateManager.reportBlockIndexingProgress(0, totalBlocksFound) // Start with 0 processed

			// The handleBlocksIndexed callback will have updated the cumulativeBlocksIndexed.
			// Now, we just need to ensure the final state is correct.
			this.stateManager.reportBlockIndexingProgress(cumulativeBlocksIndexed, totalBlocksFound)

			if (batchErrors.length > 0 && cumulativeBlocksIndexed === 0 && totalBlocksFound > 0) {
				const firstError = batchErrors[0]
				throw new Error(`Indexing failed completely: ${firstError.message}`)
			}

			if (processedFiles > 0 && cumulativeBlocksIndexed === 0 && batchErrors.length === 0) {
				throw new Error(
					"Indexing failed: No code blocks were indexed. This often means the embedder is not configured correctly or API keys are invalid.",
				)
			}

			// Start the watcher, but don't finalize the state yet.
			// The watcher will transition the state to "Indexed" when ready.
			await this._startWatcher()

			// Set a transitional state to indicate the initial scan is done and we are now watching.
			if (this.stateManager.state !== "Error") {
				// If the file watcher queue is empty after the initial scan, we can consider it fully indexed.
				if (this.fileWatcher.getQueueSize() === 0) {
					this.stateManager.setSystemState("Indexed", "Index is up-to-date.")
				} else {
					this.stateManager.setSystemState("Indexing", "Initial scan complete. Watching for file changes...")
				}
			}
		} catch (error: any) {
			console.error("[CodeIndexOrchestrator] Error during indexing:", error)
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "startIndexing",
			})
			try {
				await this.vectorStore.clearCollection()
			} catch (cleanupError) {
				console.error("[CodeIndexOrchestrator] Failed to clean up after error:", cleanupError)
				TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
					error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
					stack: cleanupError instanceof Error ? cleanupError.stack : undefined,
					location: "startIndexing.cleanup",
				})
			}

			await this.cacheManager.clearCacheFile()

			this.stateManager.setSystemState("Error", `Failed during initial scan: ${error.message || "Unknown error"}`)
			this.stopWatcher()
		} finally {
			this._isProcessing = false
		}
	}

	/**
	 * Stops the file watcher and cleans up resources.
	 */
	public stopWatcher(): void {
		this.fileWatcher.dispose()
		this._fileWatcherSubscriptions.forEach((sub) => sub.dispose())
		this._fileWatcherSubscriptions = []

		if (this.stateManager.state !== "Error") {
			this.stateManager.setSystemState("Standby", "File watcher stopped.")
		}
		this._isProcessing = false
	}

	/**
	 * Clears all index data by stopping the watcher, clearing the vector store,
	 * and resetting the cache file.
	 */
	public async clearIndexData(): Promise<void> {
		this._isProcessing = true

		try {
			await this.stopWatcher()

			try {
				if (this.configManager.isFeatureConfigured) {
					await this.vectorStore.deleteCollection()
				} else {
					console.warn("[CodeIndexOrchestrator] Service not configured, skipping vector collection clear.")
				}
			} catch (error: any) {
				console.error("[CodeIndexOrchestrator] Failed to clear vector collection:", error)
				TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					location: "clearIndexData",
				})
				this.stateManager.setSystemState("Error", `Failed to clear vector collection: ${error.message}`)
			}

			await this.cacheManager.clearCacheFile()

			if (this.stateManager.state !== "Error") {
				this.stateManager.setSystemState("Standby", "Index data cleared successfully.")
			}
		} finally {
			this._isProcessing = false
		}
	}

	/**
	 * Gets the current state of the indexing system.
	 */
	public get state(): IndexingState {
		return this.stateManager.state
	}
}
