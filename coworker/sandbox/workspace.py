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
OPENSHELL = "openshell"


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
    def __init__(
        self,
        provider: Any,
        *,
        cwd: str | Path,
        shell: str = "main",
        registry: Any = None,
        session_id: str = "",
        agent: str = "",
    ) -> None:
        from .client import RunnerClient
        from .executor import RunnerExecutor

        self.provider = provider
        self.registry = registry
        self._registered: Optional[str] = None
        if registry is not None:
            registry.reap()  # sandboxes left behind by a server that is gone
            registry.check_room()
        provider.create()
        try:
            self.client = RunnerClient(provider.open_runner)
            self.hello = self.client.connect()
            verify = getattr(provider, "verify", None)
            if verify is not None:
                verify(self.client)  # e.g. every folder is really reachable inside
        except Exception:
            provider.destroy()
            raise
        self._executor = RunnerExecutor(self.client, cwd=str(Path(cwd).expanduser().resolve()), shell=shell)
        if registry is not None:
            info = provider.describe()
            self._registered = str(info.get("sandbox") or f"{info['provider']}-{id(self):x}")
            registry.record(
                self._registered,
                provider=info["provider"],
                session_id=session_id,
                agent=agent,
                roots=getattr(provider, "roots", None),
                profile=getattr(provider, "profile", ""),
                enforcement=info.get("enforcement", ""),
            )

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
            if self.registry is not None and self._registered:
                self.registry.close(self._registered)


def provider_name(explicit: Optional[str] = None) -> str:
    return (explicit or os.environ.get(PROVIDER_ENV) or DIRECT).strip().lower()


def open_workspace(
    *,
    cwd: str | Path,
    provider: Optional[str] = None,
    roots: Optional[list] = None,
    session_id: str = "",
    agent: str = "",
) -> Workspace:
    """The session's workspace for the configured provider. `direct` unless told otherwise.
    `roots`: the session's RootDir list (primary first); without it the workspace folder is
    the only, writable, root. `session_id` and `agent` say who the sandbox is for; they go
    into the registry and onto the sandbox as a label."""
    name = provider_name(provider)
    if name == DIRECT:
        return DirectWorkspace(cwd=cwd)
    if name == RUNNER_LOCAL:
        from .providers.runner_local import RunnerLocalProvider

        return RunnerWorkspace(RunnerLocalProvider(cwd=cwd), cwd=cwd)
    if name == OPENSHELL:
        from .providers.openshell import OpenShellProvider

        listed = [{"path": str(r.path), "writable": bool(r.writable)} for r in (roots or [])]
        listed = listed or [{"path": str(cwd), "writable": True}]
        from .registry import SandboxRegistry

        label = "-".join(part for part in (session_id[:24], agent[:24]) if part)
        return RunnerWorkspace(
            OpenShellProvider(roots=listed, cwd=str(cwd), label=label),
            cwd=cwd,
            registry=SandboxRegistry(),
            session_id=session_id,
            agent=agent,
        )
    raise ValueError(f"unknown sandbox provider: {name!r} (known: {DIRECT}, {OPENSHELL}, {RUNNER_LOCAL})")
