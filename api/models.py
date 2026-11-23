"""SQLAlchemy models and database session setup.

Phase 2 introduced conversations/messages. Phase 3 adds the persistent model
registry. ``Base.metadata.create_all`` is used for schema initialization; it is
idempotent and only creates missing tables, so existing databases keep working.

``create_all`` does not add indexes to tables that already exist, which means a
database created before an index was declared would never receive it. The
``ensure_indexes`` migration below closes that gap at every startup.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False, default="New Conversation")
    model = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=_uuid)
    conversation_id = Column(
        String,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    tokens = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class ModelRecord(Base):
    """A GGUF model known to this installation.

    ``path`` is stored absolute and is unique, which prevents the same file
    from being registered twice.
    """

    __tablename__ = "models"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    path = Column(String, nullable=False, unique=True, index=True)
    quant = Column(String, nullable=False, default="UNKNOWN")
    size = Column(Integer, nullable=False, default=0)
    context = Column(Integer, nullable=False, default=4096)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


def ensure_indexes() -> None:
    """Create indexes that are missing from pre-existing tables.

    This is the migration path for databases created before an index was
    declared (for example ``messages.conversation_id``). ``checkfirst`` makes it
    safe to run on every startup and against freshly created databases.
    """
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            for index in table.indexes:
                index.create(bind=connection, checkfirst=True)


def init_db() -> None:
    """Create any missing tables and indexes."""
    Base.metadata.create_all(bind=engine)
    ensure_indexes()


def get_db():
    """Return a new SQLAlchemy session. Callers are responsible for closing."""
    return SessionLocal()
