import React, {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	CheckCheck,
	SquareMousePointer,
	Webhook,
	GitBranch,
	Bell,
	Database,
	SquareTerminal,
	FlaskConical,
	AlertTriangle,
	Globe,
	Info,
	MessageSquare,
	LucideIcon,
} from "lucide-react"

import type { ProviderSettings, ExperimentId, ProviderName } from "@roo-code/types"
import { getModelSettingsKey } from "@src/components/chat/hooks/useModelSettings"

import { TelemetrySetting } from "@roo/TelemetrySetting"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ExtensionStateContextType, useExtensionState } from "@src/context/ExtensionStateContext"
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
	AlertDialogAction,
	AlertDialogHeader,
	AlertDialogFooter,
	Button,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	StandardTooltip,
} from "@src/components/ui"

import { Tab, TabContent, TabHeader, TabList, TabTrigger } from "../common/Tab"
import { SetCachedStateField, SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import ApiConfigManager from "./ApiConfigManager"
import ApiOptions from "./ApiOptions"
import { AutoApproveSettings } from "./AutoApproveSettings"
import { BrowserSettings } from "./BrowserSettings"
import { CheckpointSettings } from "./CheckpointSettings"
import { NotificationSettings } from "./NotificationSettings"
import { ContextManagementSettings } from "./ContextManagementSettings"
import { TerminalSettings } from "./TerminalSettings"
import { ExperimentalSettings } from "./ExperimentalSettings"
import { LanguageSettings } from "./LanguageSettings"
import { About } from "./About"
import { Section } from "./Section"
import PromptsSettings from "./PromptsSettings"
import { cn } from "@/lib/utils"

export const settingsTabsContainer = "flex flex-1 overflow-hidden [&.narrow_.tab-label]:hidden"
export const settingsTabList =
	"w-48 data-[compact=true]:w-12 flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden border-r border-vscode-sideBar-background"
export const settingsTabTrigger =
	"whitespace-nowrap overflow-hidden min-w-0 h-12 px-4 py-3 box-border flex items-center border-l-2 border-transparent text-vscode-foreground opacity-70 hover:bg-vscode-list-hoverBackground data-[compact=true]:w-12 data-[compact=true]:p-4"
export const settingsTabTriggerActive = "opacity-100 border-vscode-focusBorder bg-vscode-list-activeSelectionBackground"

export interface SettingsViewRef {
	checkUnsaveChanges: (then: () => void) => void
}

const sectionNames = [
	"providers",
	"autoApprove",
	"browser",
	"checkpoints",
	"notifications",
	"contextManagement",
	"terminal",
	"prompts",
	"experimental",
	"language",
	"about",
] as const

type SectionName = (typeof sectionNames)[number]

type SettingsViewProps = {
	onDone: () => void
	targetSection?: string
}

const SettingsView = forwardRef<SettingsViewRef, SettingsViewProps>(({ onDone, targetSection }, ref) => {
	const { t } = useAppTranslation()

	const extensionState = useExtensionState()
	const { currentApiConfigName, listApiConfigMeta, uriScheme, settingsImportedAt } = extensionState

	const [isDiscardDialogShow, setDiscardDialogShow] = useState(false)
	const [isChangeDetected, setChangeDetected] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
	const [activeTab, setActiveTab] = useState<SectionName>(
		targetSection && sectionNames.includes(targetSection as SectionName)
			? (targetSection as SectionName)
			: "providers",
	)

	const prevApiConfigName = useRef(currentApiConfigName)
	const confirmDialogHandler = useRef<() => void>()

	const [cachedState, setCachedState] = useState(extensionState)

	const {
		alwaysAllowReadOnly,
		alwaysAllowReadOnlyOutsideWorkspace,
		allowedCommands,
		deniedCommands,
		allowedMaxRequests,
		language,
		alwaysAllowBrowser,
		alwaysAllowExecute,
		alwaysAllowMcp,
		alwaysAllowModeSwitch,
		alwaysAllowSubtasks,
		alwaysAllowWrite,
		alwaysAllowWriteOutsideWorkspace,
		alwaysAllowWriteProtected,
		alwaysApproveResubmit,
		autoCondenseContext,
		autoCondenseContextPercent,
		browserToolEnabled,
		browserViewportSize,
		enableCheckpoints,
		diffEnabled,
		experiments,
		fuzzyMatchThreshold,
		maxOpenTabsContext,
		maxWorkspaceFiles,
		mcpEnabled,
		requestDelaySeconds,
		remoteBrowserHost,
		screenshotQuality,
		soundEnabled,
		ttsEnabled,
		ttsSpeed,
		soundVolume,
		telemetrySetting,
		terminalOutputLineLimit,
		terminalShellIntegrationTimeout,
		terminalShellIntegrationDisabled, // Added from upstream
		terminalCommandDelay,
		terminalPowershellCounter,
		terminalZshClearEolMark,
		terminalZshOhMy,
		terminalZshP10k,
		terminalZdotdir,
		writeDelayMs,
		showRooIgnoredFiles,
		remoteBrowserEnabled,
		maxReadFileLine,
		terminalCompressProgressBar,
		maxConcurrentFileReads,
		condensingApiConfigId,
		customCondensingPrompt,
		customSupportPrompts,
		profileThresholds,
		alwaysAllowFollowupQuestions,
		alwaysAllowUpdateTodoList,
		followupAutoApproveTimeoutMs,
	} = cachedState

	const apiConfiguration = useMemo(() => cachedState.apiConfiguration ?? {}, [cachedState.apiConfiguration])

	useEffect(() => {
		// Update only when currentApiConfigName is changed.
		// Expected to be triggered by loadApiConfiguration/upsertApiConfiguration.
		if (prevApiConfigName.current === currentApiConfigName) {
			return
		}

		setCachedState((prevCachedState) => ({ ...prevCachedState, ...extensionState }))
		prevApiConfigName.current = currentApiConfigName
		setChangeDetected(false)
	}, [currentApiConfigName, extensionState, isChangeDetected])

	// Bust the cache when settings are imported.
	useEffect(() => {
		if (settingsImportedAt) {
			setCachedState((prevCachedState) => ({ ...prevCachedState, ...extensionState }))
			setChangeDetected(false)
		}
	}, [settingsImportedAt, extensionState])

	const setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType> = useCallback((field, value) => {
		setCachedState((prevState) => {
			if (prevState[field] === value) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, [field]: value }
		})
	}, [])

	const setApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setCachedState((prevState) => {
				const provider = prevState.apiConfiguration?.apiProvider as ProviderName
				const modelId = prevState.apiConfiguration?.apiModelId
				const modelSpecificFields: (keyof ProviderSettings)[] = [
					"modelMaxTokens",
					"modelMaxThinkingTokens",
					"enableReasoningEffort",
				]

				if (provider && modelId && modelSpecificFields.includes(field)) {
					const modelSettingsKey = getModelSettingsKey(provider, modelId)
					const existingSettings = prevState.apiConfiguration?.modelSettings?.[modelSettingsKey] ?? {}
					const updatedModelSettings = {
						...prevState.apiConfiguration?.modelSettings,
						[modelSettingsKey]: {
							...existingSettings,
							[field]: value,
						},
					}

					if (
						JSON.stringify(prevState.apiConfiguration?.modelSettings?.[modelSettingsKey]) ===
						JSON.stringify(updatedModelSettings[modelSettingsKey])
					) {
						return prevState
					}

					setChangeDetected(true)
					return {
						...prevState,
						apiConfiguration: {
							...prevState.apiConfiguration,
							modelSettings: updatedModelSettings,
						},
					}
				} else {
					if (prevState.apiConfiguration?.[field] === value) {
						return prevState
					}

					const previousValue = prevState.apiConfiguration?.[field]

					// Don't treat initial sync from undefined to a defined value as a user change
					// This prevents the dirty state when the component initializes and auto-syncs the model ID
					const isInitialSync = previousValue === undefined && value !== undefined

					if (!isInitialSync) {
						setChangeDetected(true)
					}
					return { ...prevState, apiConfiguration: { ...prevState.apiConfiguration, [field]: value } }
				}
			})
		},
		[],
	)

	const setExperimentEnabled: SetExperimentEnabled = useCallback((id: ExperimentId, enabled: boolean) => {
		setCachedState((prevState) => {
			if (prevState.experiments?.[id] === enabled) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, experiments: { ...prevState.experiments, [id]: enabled } }
		})
	}, [])

	const setTelemetrySetting = useCallback((setting: TelemetrySetting) => {
		setCachedState((prevState) => {
			if (prevState.telemetrySetting === setting) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, telemetrySetting: setting }
		})
	}, [])

	const setCustomSupportPromptsField = useCallback((prompts: Record<string, string | undefined>) => {
		setCachedState((prevState) => {
			if (JSON.stringify(prevState.customSupportPrompts) === JSON.stringify(prompts)) {
				return prevState
			}

			setChangeDetected(true)
			return { ...prevState, customSupportPrompts: prompts }
		})
	}, [])

	const isSettingValid = !errorMessage

	const handleSubmit = () => {
		if (isSettingValid) {
			const settingsToUpdate = {
				language,
				alwaysAllowReadOnly,
				alwaysAllowReadOnlyOutsideWorkspace,
				alwaysAllowWrite,
				alwaysAllowWriteOutsideWorkspace,
				alwaysAllowWriteProtected,
				alwaysAllowExecute,
				alwaysAllowBrowser,
				alwaysAllowMcp,
				allowedCommands: allowedCommands ?? [],
				deniedCommands: deniedCommands ?? [],
				allowedMaxRequests: allowedMaxRequests ?? undefined,
				autoCondenseContext,
				autoCondenseContextPercent,
				browserToolEnabled,
				soundEnabled,
				ttsEnabled,
				ttsSpeed,
				soundVolume,
				diffEnabled,
				enableCheckpoints,
				browserViewportSize,
				remoteBrowserHost,
				remoteBrowserEnabled,
				fuzzyMatchThreshold: fuzzyMatchThreshold ?? 1.0,
				writeDelayMs,
				screenshotQuality: screenshotQuality ?? 75,
				terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
				terminalShellIntegrationTimeout,
				terminalShellIntegrationDisabled,
				terminalCommandDelay,
				terminalPowershellCounter,
				terminalZshClearEolMark,
				terminalZshOhMy,
				terminalZshP10k,
				terminalZdotdir,
				terminalCompressProgressBar,
				mcpEnabled,
				alwaysApproveResubmit,
				requestDelaySeconds,
				maxOpenTabsContext,
				maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
				showRooIgnoredFiles,
				maxReadFileLine: maxReadFileLine ?? -1,
				maxConcurrentFileReads: cachedState.maxConcurrentFileReads ?? 5,
				currentApiConfigName,
				experiments,
				alwaysAllowModeSwitch,
				alwaysAllowSubtasks,
				alwaysAllowFollowupQuestions,
				alwaysAllowUpdateTodoList,
				followupAutoApproveTimeoutMs,
				condensingApiConfigId: condensingApiConfigId || "",
				customCondensingPrompt: customCondensingPrompt || "",
				customSupportPrompts: customSupportPrompts || {},
				telemetrySetting,
				profileThresholds,
			}
			vscode.postMessage({
				type: "updateAllSettings",
				settings: settingsToUpdate,
				apiConfiguration,
			})
			setChangeDetected(false)
		}
	}

	const checkUnsaveChanges = useCallback(
		(then: () => void) => {
			if (isChangeDetected) {
				confirmDialogHandler.current = then
				setDiscardDialogShow(true)
			} else {
				then()
			}
		},
		[isChangeDetected],
	)

	useImperativeHandle(ref, () => ({ checkUnsaveChanges }), [checkUnsaveChanges])

	const onConfirmDialogResult = useCallback(
		(confirm: boolean) => {
			if (confirm) {
				// Discard changes: Reset state and flag
				setCachedState(extensionState) // Revert to original state
				setChangeDetected(false) // Reset change flag
				confirmDialogHandler.current?.() // Execute the pending action (e.g., tab switch)
			}
			// If confirm is false (Cancel), do nothing, dialog closes automatically
		},
		[extensionState], // Depend on extensionState to get the latest original state
	)

	// Handle tab changes with unsaved changes check
	const handleTabChange = useCallback(
		(newTab: SectionName) => {
			// Directly switch tab without checking for unsaved changes
			setActiveTab(newTab)
		},
		[], // No dependency on isChangeDetected needed anymore
	)

	// Store direct DOM element refs for each tab
	const tabRefs = useRef<Record<SectionName, HTMLButtonElement | null>>(
		Object.fromEntries(sectionNames.map((name) => [name, null])) as Record<SectionName, HTMLButtonElement | null>,
	)

	// Track whether we're in compact mode
	const [isCompactMode, setIsCompactMode] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Setup resize observer to detect when we should switch to compact mode
	useEffect(() => {
		if (!containerRef.current) return

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				// If container width is less than 500px, switch to compact mode
				setIsCompactMode(entry.contentRect.width < 500)
			}
		})

		observer.observe(containerRef.current)

		return () => {
			observer?.disconnect()
		}
	}, [])

	const sections: { id: SectionName; icon: LucideIcon }[] = useMemo(
		() => [
			{ id: "providers", icon: Webhook },
			{ id: "autoApprove", icon: CheckCheck },
			{ id: "browser", icon: SquareMousePointer },
			{ id: "checkpoints", icon: GitBranch },
			{ id: "notifications", icon: Bell },
			{ id: "contextManagement", icon: Database },
			{ id: "terminal", icon: SquareTerminal },
			{ id: "prompts", icon: MessageSquare },
			{ id: "experimental", icon: FlaskConical },
			{ id: "language", icon: Globe },
			{ id: "about", icon: Info },
		],
		[], // No dependencies needed now
	)

	// Update target section logic to set active tab
	useEffect(() => {
		if (targetSection && sectionNames.includes(targetSection as SectionName)) {
			setActiveTab(targetSection as SectionName)
		}
	}, [targetSection])

	// Function to scroll the active tab into view for vertical layout
	const scrollToActiveTab = useCallback(() => {
		const activeTabElement = tabRefs.current[activeTab]

		if (activeTabElement) {
			activeTabElement.scrollIntoView({
				behavior: "auto",
				block: "nearest",
			})
		}
	}, [activeTab])

	// Effect to scroll when the active tab changes
	useEffect(() => {
		scrollToActiveTab()
	}, [activeTab, scrollToActiveTab])

	// Effect to scroll when the webview becomes visible
	useLayoutEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "action" && message.action === "didBecomeVisible") {
				scrollToActiveTab()
			}
		}

		window.addEventListener("message", handleMessage)

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [scrollToActiveTab])

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center gap-2">
				<div className="flex items-center gap-1">
					<h3 className="text-vscode-foreground m-0">{t("settings:header.title")}</h3>
				</div>
				<div className="flex gap-2">
					<StandardTooltip
						content={
							!isSettingValid
								? errorMessage
								: isChangeDetected
									? t("settings:header.saveButtonTooltip")
									: t("settings:header.nothingChangedTooltip")
						}>
						<Button
							variant={isSettingValid ? "default" : "secondary"}
							className={!isSettingValid ? "!border-vscode-errorForeground" : ""}
							onClick={handleSubmit}
							disabled={!isChangeDetected || !isSettingValid}
							data-testid="save-button">
							{t("settings:common.save")}
						</Button>
					</StandardTooltip>
					<StandardTooltip content={t("settings:header.doneButtonTooltip")}>
						<Button variant="secondary" onClick={() => checkUnsaveChanges(onDone)}>
							{t("settings:common.done")}
						</Button>
					</StandardTooltip>
				</div>
			</TabHeader>

			{/* Vertical tabs layout */}
			<div ref={containerRef} className={cn(settingsTabsContainer, isCompactMode && "narrow")}>
				{/* Tab sidebar */}
				<TabList
					value={activeTab}
					onValueChange={(value) => handleTabChange(value as SectionName)}
					className={cn(settingsTabList)}
					data-compact={isCompactMode}
					data-testid="settings-tab-list">
					{sections.map(({ id, icon: Icon }) => {
						const isSelected = id === activeTab
						const onSelect = () => handleTabChange(id)

						// Base TabTrigger component definition
						// We pass isSelected manually for styling, but onSelect is handled conditionally
						const triggerComponent = (
							<TabTrigger
								ref={(element) => (tabRefs.current[id] = element)}
								value={id}
								isSelected={isSelected} // Pass manually for styling state
								className={cn(
									isSelected // Use manual isSelected for styling
										? `${settingsTabTrigger} ${settingsTabTriggerActive}`
										: settingsTabTrigger,
									"focus:ring-0", // Remove the focus ring styling
								)}
								data-testid={`tab-${id}`}
								data-compact={isCompactMode}>
								<div className={cn("flex items-center gap-2", isCompactMode && "justify-center")}>
									<Icon className="w-4 h-4" />
									<span className="tab-label">{t(`settings:sections.${id}`)}</span>
								</div>
							</TabTrigger>
						)

						if (isCompactMode) {
							// Wrap in Tooltip and manually add onClick to the trigger
							return (
								<TooltipProvider key={id} delayDuration={300}>
									<Tooltip>
										<TooltipTrigger asChild onClick={onSelect}>
											{/* Clone to avoid ref issues if triggerComponent itself had a key */}
											{React.cloneElement(triggerComponent)}
										</TooltipTrigger>
										<TooltipContent side="right" className="text-base">
											<p className="m-0">{t(`settings:sections.${id}`)}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)
						} else {
							// Render trigger directly; TabList will inject onSelect via cloning
							// Ensure the element passed to TabList has the key
							return React.cloneElement(triggerComponent, { key: id })
						}
					})}
				</TabList>

				{/* Content area */}
				<TabContent className="p-0 flex-1 overflow-auto">
					{/* Providers Section */}
					{activeTab === "providers" && (
						<div>
							<SectionHeader>
								<div className="flex items-center gap-2">
									<Webhook className="w-4" />
									<div>{t("settings:sections.providers")}</div>
								</div>
							</SectionHeader>

							<Section>
								<ApiConfigManager
									currentApiConfigName={currentApiConfigName}
									listApiConfigMeta={listApiConfigMeta}
									onSelectConfig={(configName: string) =>
										checkUnsaveChanges(() =>
											vscode.postMessage({ type: "loadApiConfiguration", text: configName }),
										)
									}
									onDeleteConfig={(configName: string) =>
										vscode.postMessage({ type: "deleteApiConfiguration", text: configName })
									}
									onRenameConfig={(oldName: string, newName: string) => {
										vscode.postMessage({
											type: "renameApiConfiguration",
											values: { oldName, newName },
											apiConfiguration,
										})
										prevApiConfigName.current = newName
									}}
									onUpsertConfig={(configName: string) =>
										vscode.postMessage({
											type: "upsertApiConfiguration",
											text: configName,
											apiConfiguration,
										})
									}
								/>
								<ApiOptions
									uriScheme={uriScheme}
									apiConfiguration={apiConfiguration}
									setApiConfigurationField={setApiConfigurationField}
									errorMessage={errorMessage}
									setErrorMessage={setErrorMessage}
								/>
							</Section>
						</div>
					)}

					{/* Auto-Approve Section */}
					{activeTab === "autoApprove" && (
						<AutoApproveSettings
							alwaysAllowReadOnly={alwaysAllowReadOnly}
							alwaysAllowReadOnlyOutsideWorkspace={alwaysAllowReadOnlyOutsideWorkspace}
							alwaysAllowWrite={alwaysAllowWrite}
							alwaysAllowWriteOutsideWorkspace={alwaysAllowWriteOutsideWorkspace}
							alwaysAllowWriteProtected={alwaysAllowWriteProtected}
							writeDelayMs={writeDelayMs}
							alwaysAllowBrowser={alwaysAllowBrowser}
							alwaysApproveResubmit={alwaysApproveResubmit}
							requestDelaySeconds={requestDelaySeconds}
							alwaysAllowMcp={alwaysAllowMcp}
							alwaysAllowModeSwitch={alwaysAllowModeSwitch}
							alwaysAllowSubtasks={alwaysAllowSubtasks}
							alwaysAllowExecute={alwaysAllowExecute}
							alwaysAllowFollowupQuestions={alwaysAllowFollowupQuestions}
							alwaysAllowUpdateTodoList={alwaysAllowUpdateTodoList}
							followupAutoApproveTimeoutMs={followupAutoApproveTimeoutMs}
							allowedCommands={allowedCommands}
							deniedCommands={deniedCommands}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Browser Section */}
					{activeTab === "browser" && (
						<BrowserSettings
							browserToolEnabled={browserToolEnabled}
							browserViewportSize={browserViewportSize}
							screenshotQuality={screenshotQuality}
							remoteBrowserHost={remoteBrowserHost}
							remoteBrowserEnabled={remoteBrowserEnabled}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Checkpoints Section */}
					{activeTab === "checkpoints" && (
						<CheckpointSettings
							enableCheckpoints={enableCheckpoints}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Notifications Section */}
					{activeTab === "notifications" && (
						<NotificationSettings
							ttsEnabled={ttsEnabled}
							ttsSpeed={ttsSpeed}
							soundEnabled={soundEnabled}
							soundVolume={soundVolume}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Context Management Section */}
					{activeTab === "contextManagement" && (
						<ContextManagementSettings
							autoCondenseContext={autoCondenseContext}
							autoCondenseContextPercent={autoCondenseContextPercent}
							condensingApiConfigId={condensingApiConfigId}
							customCondensingPrompt={customCondensingPrompt}
							listApiConfigMeta={listApiConfigMeta ?? []}
							maxOpenTabsContext={maxOpenTabsContext}
							maxWorkspaceFiles={maxWorkspaceFiles ?? 200}
							showRooIgnoredFiles={showRooIgnoredFiles}
							maxReadFileLine={maxReadFileLine}
							maxConcurrentFileReads={maxConcurrentFileReads}
							profileThresholds={profileThresholds}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Terminal Section */}
					{activeTab === "terminal" && (
						<TerminalSettings
							terminalOutputLineLimit={terminalOutputLineLimit}
							terminalShellIntegrationTimeout={terminalShellIntegrationTimeout}
							terminalShellIntegrationDisabled={terminalShellIntegrationDisabled}
							terminalCommandDelay={terminalCommandDelay}
							terminalPowershellCounter={terminalPowershellCounter}
							terminalZshClearEolMark={terminalZshClearEolMark}
							terminalZshOhMy={terminalZshOhMy}
							terminalZshP10k={terminalZshP10k}
							terminalZdotdir={terminalZdotdir}
							terminalCompressProgressBar={terminalCompressProgressBar}
							setCachedStateField={setCachedStateField}
						/>
					)}

					{/* Prompts Section */}
					{activeTab === "prompts" && (
						<PromptsSettings
							customSupportPrompts={customSupportPrompts || {}}
							setCustomSupportPrompts={setCustomSupportPromptsField}
						/>
					)}

					{/* Experimental Section */}
					{activeTab === "experimental" && (
						<ExperimentalSettings setExperimentEnabled={setExperimentEnabled} experiments={experiments} />
					)}

					{/* Language Section */}
					{activeTab === "language" && (
						<LanguageSettings language={language || "en"} setCachedStateField={setCachedStateField} />
					)}

					{/* About Section */}
					{activeTab === "about" && (
						<About telemetrySetting={telemetrySetting} setTelemetrySetting={setTelemetrySetting} />
					)}
				</TabContent>
			</div>

			<AlertDialog open={isDiscardDialogShow} onOpenChange={setDiscardDialogShow}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<AlertTriangle className="w-5 h-5 text-yellow-500" />
							{t("settings:unsavedChangesDialog.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings:unsavedChangesDialog.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => onConfirmDialogResult(false)}>
							{t("settings:unsavedChangesDialog.cancelButton")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={() => onConfirmDialogResult(true)}>
							{t("settings:unsavedChangesDialog.discardButton")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Tab>
	)
})

export default memo(SettingsView)
