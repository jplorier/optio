# Implement OpenAI Codex agent adapter

Implement OpenAI Codex agent adapter

## Description

The Codex adapter in `packages/agent-adapters/src/claude-code.ts` is currently a stub. `parseResult()` is hardcoded to `success: exitCode === 0` without actually parsing Codex output, and there's no cost tracking, error handling, or PR detection.

## Current state

- `buildContainerConfig()` is implemented
- `parseResult()` is a dummy — doesn't parse Codex output format
- No cost tracking
- No PR URL extraction from Codex output
- No Codex-specific error handling

## Acceptance criteria

- Codex adapter correctly parses agent output
- PR URLs are detected from Codex logs
- Cost tracking works (if Codex exposes usage data)
- Error classification handles Codex-specific failure modes
- If Codex output format can't be determined, remove Codex from the UI agent selector rather than leaving a broken option

---

_Optio Task ID: 7633f5f4-eb11-4891-8a4a-070704352f8f_
