from django.apps import AppConfig


class ServerConfig(AppConfig):
    name = "server"

    def ready(self):
        """Reset sessions stuck in 'running' state from a previous server process."""
        from .db import get_collection, CHAT_SESSIONS_COLLECTION
        try:
            col = get_collection(CHAT_SESSIONS_COLLECTION)
            col.update_many({"status": "running"}, {"$set": {"status": "idle"}})
        except Exception:
            pass
