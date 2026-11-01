"""SQLAlchemy models and database session setup.

Phase 2 introduced conversations/messages. Phase 3 adds the persistent model
registry. ``Base.metadata.create_all`` is used for schema initialization; it is
idempotent and only creates missing tables, so existing databases keep working.
"""

from __future__ import annotations

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


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: f"conv-{_utcnow().timestamp()}")
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

    id = Column(String, primary_key=True, default=lambda: f"msg-{_utcnow().timestamp()}")
    conversation_id = Column(
        String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
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


def init_db() -> None:
    """Create any missing tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Return a new SQLAlchemy session. Callers are responsible for closing."""
    return SessionLocal()
