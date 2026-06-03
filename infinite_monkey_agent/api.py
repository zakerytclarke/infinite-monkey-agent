from __future__ import annotations

from datetime import datetime
from typing import Generator, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, Integer, String, Text, create_engine, func, or_, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


DATABASE_URL = "sqlite:///./posts.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PostCreate(BaseModel):
    title: str
    content: str


class PostUpdate(BaseModel):
    title: str
    content: str


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


app = FastAPI(title="Simple FastAPI CRUD API", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(post: PostCreate, db: Session = Depends(get_db)) -> Post:
    db_post = Post(title=post.title, content=post.content)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post


@app.get("/posts", response_model=list[PostRead])
def list_posts(
    search: Optional[str] = Query(default=None, description="Search by title or content"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[Post]:
    stmt = select(Post)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Post.title.ilike(pattern), Post.content.ilike(pattern)))
    stmt = stmt.order_by(Post.created_at.desc(), Post.id.desc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


@app.get("/posts/{post_id}", response_model=PostRead)
def get_post(post_id: int, db: Session = Depends(get_db)) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@app.put("/posts/{post_id}", response_model=PostRead)
def update_post(post_id: int, payload: PostUpdate, db: Session = Depends(get_db)) -> Post:
    db_post = db.get(Post, post_id)
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    db_post.title = payload.title
    db_post.content = payload.content
    db_post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_post)
    return db_post


@app.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, db: Session = Depends(get_db)) -> Response:
    db_post = db.get(Post, post_id)
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    db.delete(db_post)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
