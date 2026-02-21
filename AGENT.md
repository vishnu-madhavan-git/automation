# AGENT.md - Global Rules for AI Agents

## 🛡️ The "Junior Engineer" Rule

- AI agents are **proposals managers**, not autonomous committers.
- Always outline assumptions before suggesting actions.
- Propose changes via Draft PRs or separate branches.
- **NEVER** push to the `main` branch or execute critical system changes without Human-in-the-Loop (Admin) validation.

## 🎯 Single Responsibility Principle

- Each agent should have one clear goal and a narrow scope.
- Modular pipelines are preferred over "do-everything" scripts.

## 🏗️ Structured Outputs

- All data passed between agents or system components **MUST** be in a strict, structured format (JSON).
- Raw text from LLMs should be parsed and validated.

## 📁 Repository Structure Standards

- `AGENT.md`: This file (Global rules and behavior).
- `.agent/`: Blueprints, requirements, and task definitions.
- `cognition/`: AI reasoning, planning, and memory logic.
- `tools/`: Isolated functions that agents are allowed to call.

## 💻 Coding Standards

- Follow modern JavaScript/Node.js best practices for the core.
- Use Python for DSPy-based agent logic in the `cognition/` layer.
- Ensure all new tools are documented in the `tools/` directory.
