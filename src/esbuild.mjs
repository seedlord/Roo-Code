import * as esbuild from "esbuild"
import * as fs from "fs"
import { execSync } from "child_process"
import { setTimeout } from "timers/promises"
import * as path from "path"
import { fileURLToPath } from "url"
import process from "node:process"
import * as console from "node:console"

import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "@roo-code/build"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
	const name = "extension"
	const production = process.argv.includes("--production")
	const watch = process.argv.includes("--watch")
	const minify = production
	const sourcemap = !production

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const buildOptions = {
		bundle: true,
		minify,
		sourcemap,
		logLevel: "silent",
		format: "cjs",
		sourcesContent: false,
		platform: "node",
	}

	const srcDir = __dirname
	const buildDir = __dirname
	const distDir = path.join(buildDir, "dist")

	if (fs.existsSync(distDir)) {
		console.log(`[${name}] Cleaning dist directory: ${distDir}`)
		if (process.platform === "win32") {
			try {
				execSync(`rmdir /s /q "${distDir}"`)
			} catch (e) {
				console.error(`Failed to clean dist directory: ${e}`)
			}
		} else {
			fs.rmSync(distDir, { recursive: true, force: true })
		}
	}

	/**
	 * @type {import('esbuild').Plugin[]}
	 */
	const plugins = [
		{
			name: "copyAssets",
			setup(build) {
				let isFirstRun = true
				build.onEnd(async (result) => {
					if (result.errors.length > 0) return
					if (watch && !isFirstRun) return
					isFirstRun = false

					const maxRetries = 5
					let attempt = 0
					while (attempt < maxRetries) {
						try {
							copyPaths(
								[
									["../README.md", "README.md"],
									["../CHANGELOG.md", "CHANGELOG.md"],
									["../LICENSE", "LICENSE"],
									["../.env", ".env", { optional: true }],
									["node_modules/vscode-material-icons/generated", "assets/vscode-material-icons"],
									["../webview-ui/audio", "webview-ui/audio"],
								],
								srcDir,
								buildDir,
							)
							copyWasms(srcDir, distDir)
							copyLocales(srcDir, distDir)
							break // Success
						} catch (error) {
							if (error.code === "EBUSY" && attempt < maxRetries - 1) {
								attempt++
								const delay = Math.pow(2, attempt) * 100
								console.warn(`[copyAssets] EBUSY error, retrying in ${delay}ms...`)
								await setTimeout(delay)
							} else {
								throw error
							}
						}
					}
				})
			},
		},
		{
			name: "esbuild-problem-matcher",
			setup(build) {
				build.onStart(() => console.log("[esbuild-problem-matcher#onStart]"))
				build.onEnd((result) => {
					result.errors.forEach(({ text, location }) => {
						console.error(`✘ [ERROR] ${text}`)
						if (location && location.file) {
							console.error(`    ${location.file}:${location.line}:${location.column}:`)
						}
					})

					console.log("[esbuild-problem-matcher#onEnd]")
				})
			},
		},
	]

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const extensionConfig = {
		...buildOptions,
		plugins,
		entryPoints: ["extension.ts"],
		outfile: "dist/extension.js",
		external: ["vscode"],
	}

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const workerConfig = {
		...buildOptions,
		entryPoints: ["workers/countTokens.ts"],
		outdir: "dist/workers",
	}

	const [extensionCtx, workerCtx] = await Promise.all([
		esbuild.context(extensionConfig),
		esbuild.context(workerConfig),
	])

	if (watch) {
		await Promise.all([extensionCtx.watch(), workerCtx.watch()])
		setupLocaleWatcher(srcDir, distDir)
	} else {
		await Promise.all([extensionCtx.rebuild(), workerCtx.rebuild()])
		await Promise.all([extensionCtx.dispose(), workerCtx.dispose()])
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
