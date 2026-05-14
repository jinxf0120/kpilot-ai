from typing import Dict, Optional


class CommandRecord:
    def __init__(self, command_id: str, proposed_command: str, namespace: str):
        self.command_id = command_id
        self.proposed_command = proposed_command
        self.namespace = namespace


class CommandStore:
    def __init__(self) -> None:
        self._store: Dict[str, CommandRecord] = {}

    def put(self, record: CommandRecord) -> None:
        self._store[record.command_id] = record

    def get(self, command_id: str) -> Optional[CommandRecord]:
        return self._store.get(command_id)

    def remove(self, command_id: str) -> None:
        self._store.pop(command_id, None)


store = CommandStore()
