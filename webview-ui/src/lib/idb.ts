import { openDB, DBSchema, IDBPDatabase } from "idb"
import { ClineMessage } from "@roo-code/types"

const DB_NAME = "RooCodeHistoryCache"
const DB_VERSION = 1
const STORE_NAME = "taskTimelines"

interface RooCodeDBSchema extends DBSchema {
	[STORE_NAME]: {
		key: string
		value: ClineMessage[]
	}
}

let dbPromise: Promise<IDBPDatabase<RooCodeDBSchema>> | null = null

const getDb = (): Promise<IDBPDatabase<RooCodeDBSchema>> => {
	if (!dbPromise) {
		dbPromise = openDB<RooCodeDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME)
				}
			},
		})
	}
	return dbPromise
}

export const getCachedTimeline = async (taskId: string): Promise<ClineMessage[] | undefined> => {
	try {
		const db = await getDb()
		return await db.get(STORE_NAME, taskId)
	} catch (error) {
		console.error("Failed to get cached timeline:", error)
		return undefined
	}
}

export const setCachedTimeline = async (taskId: string, history: ClineMessage[]): Promise<void> => {
	try {
		const db = await getDb()
		await db.put(STORE_NAME, history, taskId)
	} catch (error) {
		console.error("Failed to set cached timeline:", error)
	}
}

export const getMultipleCachedTimelines = async (taskIds: string[]): Promise<Record<string, ClineMessage[]>> => {
	const results: Record<string, ClineMessage[]> = {}
	try {
		const db = await getDb()
		const tx = db.transaction(STORE_NAME, "readonly")
		const store = tx.objectStore(STORE_NAME)
		await Promise.all(
			taskIds.map(async (id) => {
				const timeline = await store.get(id)
				if (timeline) {
					results[id] = timeline
				}
			}),
		)
		await tx.done
	} catch (error) {
		console.error("Failed to get multiple cached timelines:", error)
	}
	return results
}

export const setMultipleCachedTimelines = async (
	timelines: Record<string, { history: ClineMessage[] }>,
): Promise<void> => {
	try {
		const db = await getDb()
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		await Promise.all(
			Object.entries(timelines).map(([taskId, data]) => {
				return store.put(data.history, taskId)
			}),
		)
		await tx.done
	} catch (error) {
		console.error("Failed to set multiple cached timelines:", error)
	}
}
