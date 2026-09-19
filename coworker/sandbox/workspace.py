"""The Workspace: the one thing tools use to touch files and run commands.

Two implementations:
- `DirectWorkspace`: today's behaviour, in this process. No runner, no JSON-RPC, no extra
  process. This is `direct` mode and the default, kept so that benchmark readings stay
  comparable. It reports enforcement `none`.
- `RunnerWorkspace`: a tool runner behind a provider (a sandbox, or `runner-local`).

Step 1 routes the shell through the workspace. The file, git and search tools follow in
step 2 (design doc, section 11).
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional

from .runner.executor import Executor

PROVIDER_ENV = "OPENWORKER_SANDBOX_PROVIDER"
DIRECT = "direct"
RUNNER_LOCAL = "runner-local"


class Workspace(ABC):
    @property
    @abstractmethod
    def executor(self) -> Executor: ...

    @abstractmethod
    def describe(self) -> dict[str, Any]:
        """Which provider this is and how much it enforces: `full`, `partial` or `none`."""

    def close(self) -> None:
        self.executor.close()


class DirectWorkspace(Workspace):
    def __init__(self, *, cwd: str | Path) -> None:
        from ..tools.shell import LocalExecutor  # here, not at the top: tools.shell imports us

        self._executor = LocalExecutor(cwd=cwd)

    @property
    def executor(self) -> Executor:
        return self._executor

    def describe(self) -> dict[str, Any]:
        return {"provider": DIRECT, "enforcement": "none", "reason": "commands run in the OpenWorker process, unconfined"}


class RunnerWorkspace(Workspace):
    def __init__(self, provider: Any, *, cwd: str | Path, shell: str = "main") -> None:
        from .client import RunnerClient
        from .executor import RunnerExecutor

        self.provider = provider
        provider.create()
        try:
            self.client = RunnerClient(provider.open_runner)
            self.hello = self.client.connect()
        except Exception:
            provider.destroy()
            raise
        self._executor = RunnerExecutor(self.client, cwd=str(Path(cwd).expanduser().resolve()), shell=shell)

    @property
    def executor(self) -> Executor:
        return self._executor

    def describe(self) -> dict[str, Any]:
        return {**self.provider.describe(), "runner": {k: self.hello.get(k) for k in ("runner_version", "os", "machine", "instance_id")}}

    def close(self) -> None:
        try:
            self._executor.close()
        finally:
            self.client.close()
            self.provider.destroy()


def provider_name(explicit: Optional[str] = None) -> str:
    return (explicit or os.environ.get(PROVIDER_ENV) or DIRECT).strip().lower()


def open_workspace(*, cwd: str | Path, provider: Optional[str] = None) -> Workspace:
    """The session's workspace for the configured provider. `direct` unless told otherwise."""
    name = provider_name(provider)
    if name == DIRECT:
        return DirectWorkspace(cwd=cwd)
    if name == RUNNER_LOCAL:
        from .providers.runner_local import RunnerLocalProvider

        return RunnerWorkspace(RunnerLocalProvider(cwd=cwd), cwd=cwd)
    raise ValueError(f"unknown sandbox provider: {name!r} (known: {DIRECT}, {RUNNER_LOCAL})")
