export function getStartNextChildTaskDescription(): string {
	return `## start_next_child_task
Description: Starts the execution of the next pending child task in the queue. This tool should be used when the user is ready to proceed with the next step in a multi-task plan. It requires no parameters.

Usage:
<start_next_child_task>
</start_next_child_task>
`
}
