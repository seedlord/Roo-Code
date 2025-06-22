export function getNewChildTaskDescription(): string {
	return `## new_child_task
Description: Creates one or more **child tasks** (subtasks) managed by the current (parent) task. Use this to break down a complex problem into a sequence of smaller, manageable steps. The parent task can queue multiple child tasks, which can be reviewed and approved by the user as a group.

Parameters:
- tasks: (required) A **RFC 8259 compliant** JSON array of child task objects to be created. Each object must contain a 'prompt' and 'mode' and can optionally include 'files'.
  - mode: (optional) The mode to use for the child task. Defaults to the parent task's mode.
  - prompt: (required) The detailed instructions for the child task.
  - files: (optional) An array of file paths relevant to the child task.
- execute_immediately: (optional, default: false) If 'true', the first child task starts immediately after approval. If 'false', all tasks are added to a pending queue.

Behavior:
- If 'execute_immediately' is 'false', after using this tool, you MUST stop and wait for the user's next instruction.
- Do NOT call 'start_next_child_task' immediately after queueing tasks. Wait for the user to explicitly ask to start the next task.

Usage for a single task:
<new_child_task>
<tasks>[{"prompt": "Implement the fizzbuzz algorithm in a new file called fizzbuzz.js", "files": ["fizzbuzz.js"]}]</tasks>
<execute_immediately>false</execute_immediately>
</new_child_task>

Usage for multiple tasks:
<new_child_task>
<tasks>[
  {"prompt": "First, create the main application file 'app.js'"},
  {"prompt": "Next, add a utility function in 'utils.js'", "files": ["utils.js"]},
  {"prompt": "Finally, write a test for the utility function in 'utils.test.js'"}
]</tasks>
</new_child_task>
`
}
