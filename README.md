# claude-now-doing

A Claude Code mod that replaces the spinner's random verb (`Cooking...`, `Sauteing...`) with what Claude is actually doing right now.

```
Bash ▸ Run unit tests · 4s
Edit ▸ app.ts · 1s
Grep ▸ useAuth +2 · 2s
preparing Bash ▸ Run unit tests · step 3
thinking · step 3
writing · step 3 · agent ×2 (Explore auth, Fix tests)
```

## What it shows

- **A running tool** with its target and elapsed seconds. Bash shows its own description, Edit/Write/Read show the file name, Grep/Glob the pattern, Agent its task. Parallel calls add `+n`.
- **A tool being prepared**: as soon as the model starts writing a tool call, its name appears, and the target follows once that argument has fully streamed in.
- **The model's state** when no tool is running: thinking, requesting, writing, with the step number inside the turn.
- **Subagents at work**, with their task descriptions.

The engine's own elapsed time and token count stay on the line as before.

## Install

At the prompt of a terminal session:

```
/plugin install now-doing --marketplace gincheong/claude-now-doing
```

From a shell:

```
claude plugin install now-doing --marketplace gincheong/claude-now-doing
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `gincheong/claude-now-doing`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Development

Run a session with the mod loaded from its folder:

```
claude --plugin-dir /path/to/now-doing
```

Check it:

```
claude plugin validate /path/to/now-doing
tsc -p /path/to/now-doing
```

The engine writes `.claude-plugin/types/` beside the mod when it loads; that folder is generated and ignored by git.
