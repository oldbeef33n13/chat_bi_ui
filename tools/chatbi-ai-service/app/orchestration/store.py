from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from hashlib import sha1
from pathlib import Path

from app.orchestration.models import GenerationJob, ObjectRegistry, PatchProposal, ThreadContext


def now_iso() -> str:
  return datetime.now(UTC).isoformat()


def snapshot_hash(snapshot_dsl: dict) -> str:
  payload = json.dumps(snapshot_dsl, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  return sha1(payload.encode("utf-8")).hexdigest()


class OrchestrationStore:
  def __init__(self, db_path: str) -> None:
    self._db_path = db_path
    self._ensure_parent()
    self._init_schema()

  def get_thread_context(self, thread_id: str) -> ThreadContext | None:
    with self._connect() as conn:
      row = conn.execute(
        """
        select thread_id, doc_id, doc_type, selected_object_ids_json, active_section_id, active_slide_id,
               template_variables_json, last_resolved_object_id, current_intent, active_job_id,
               recent_accepted_proposal_ids_json
        from ai_thread_context
        where thread_id = ?
        """,
        (thread_id,),
      ).fetchone()
    if not row:
      return None
    return ThreadContext(
      threadId=row[0],
      docId=row[1],
      docType=row[2],
      selectedObjectIds=json.loads(row[3] or "[]"),
      activeSectionId=row[4],
      activeSlideId=row[5],
      templateVariables=json.loads(row[6] or "{}"),
      lastResolvedObjectId=row[7],
      currentIntent=row[8],
      activeJobId=row[9],
      recentAcceptedProposalIds=json.loads(row[10] or "[]"),
    )

  def save_thread_context(self, context: ThreadContext) -> None:
    with self._connect() as conn:
      conn.execute(
        """
        insert into ai_thread_context (
          thread_id, doc_id, doc_type, selected_object_ids_json, active_section_id, active_slide_id,
          template_variables_json, last_resolved_object_id, current_intent, active_job_id,
          recent_accepted_proposal_ids_json, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(thread_id) do update set
          doc_id = excluded.doc_id,
          doc_type = excluded.doc_type,
          selected_object_ids_json = excluded.selected_object_ids_json,
          active_section_id = excluded.active_section_id,
          active_slide_id = excluded.active_slide_id,
          template_variables_json = excluded.template_variables_json,
          last_resolved_object_id = excluded.last_resolved_object_id,
          current_intent = excluded.current_intent,
          active_job_id = excluded.active_job_id,
          recent_accepted_proposal_ids_json = excluded.recent_accepted_proposal_ids_json,
          updated_at = excluded.updated_at
        """,
        (
          context.threadId,
          context.docId,
          context.docType,
          json.dumps(context.selectedObjectIds, ensure_ascii=False),
          context.activeSectionId,
          context.activeSlideId,
          json.dumps(context.templateVariables, ensure_ascii=False),
          context.lastResolvedObjectId,
          context.currentIntent,
          context.activeJobId,
          json.dumps(context.recentAcceptedProposalIds, ensure_ascii=False),
          now_iso(),
        ),
      )

  def save_object_registry(self, doc_id: str, base_revision: int, snapshot_dsl: dict, registry: ObjectRegistry) -> None:
    with self._connect() as conn:
      conn.execute(
        """
        insert into ai_object_registry_cache (doc_id, base_revision, snapshot_hash, registry_json, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(doc_id, base_revision, snapshot_hash) do update set
          registry_json = excluded.registry_json,
          updated_at = excluded.updated_at
        """,
        (
          doc_id,
          base_revision,
          snapshot_hash(snapshot_dsl),
          registry.model_dump_json(by_alias=True),
          now_iso(),
        ),
      )

  def save_patch_proposal(self, proposal: PatchProposal) -> None:
    with self._connect() as conn:
      conn.execute(
        """
        insert into ai_patch_proposal (
          proposal_id, thread_id, doc_id, doc_type, base_revision, scope_type, scope_id,
          risk, summary, explanation_json, command_plan_json, preview_changed_object_ids_json,
          source, accepted, rejected, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(proposal_id) do update set
          accepted = excluded.accepted,
          rejected = excluded.rejected
        """,
        (
          proposal.proposalId,
          proposal.threadId,
          proposal.docId,
          proposal.docType,
          proposal.baseRevision,
          proposal.scopeType,
          proposal.scopeId,
          proposal.risk,
          proposal.summary,
          json.dumps(proposal.explanation, ensure_ascii=False),
          json.dumps(proposal.commandPlan, ensure_ascii=False),
          json.dumps(proposal.previewChangedObjectIds, ensure_ascii=False),
          proposal.source,
          1 if proposal.accepted else 0,
          1 if proposal.rejected else 0,
          proposal.createdAt,
        ),
      )

  def save_generation_job(self, job: GenerationJob) -> None:
    with self._connect() as conn:
      conn.execute(
        """
        insert into ai_generation_job (
          job_id, thread_id, doc_id, doc_type, base_revision, flow_type,
          goal, status, outline_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(job_id) do update set
          status = excluded.status,
          outline_json = excluded.outline_json,
          updated_at = excluded.updated_at
        """,
        (
          job.jobId,
          job.threadId,
          job.docId,
          job.docType,
          job.baseRevision,
          job.flowType,
          job.goal,
          job.status,
          job.outline.model_dump_json(by_alias=True),
          job.createdAt,
          job.updatedAt,
        ),
      )
      conn.execute("delete from ai_generation_unit where job_id = ?", (job.jobId,))
      for unit in job.units:
        conn.execute(
          """
          insert into ai_generation_unit (
            unit_id, job_id, title, goal, unit_type, order_index, status, result_proposal_id, error_message, artifact_json
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          (
            unit.unitId,
            job.jobId,
            unit.title,
            unit.goal,
            unit.unitType,
            unit.orderIndex,
            unit.status,
            unit.resultProposalId,
            unit.errorMessage,
            unit.artifact.model_dump_json(by_alias=True) if unit.artifact else None,
          ),
        )

  def get_generation_job(self, job_id: str) -> GenerationJob | None:
    with self._connect() as conn:
      row = conn.execute(
        """
        select job_id, thread_id, doc_id, doc_type, base_revision, flow_type,
               goal, status, outline_json, created_at, updated_at
        from ai_generation_job
        where job_id = ?
        """,
        (job_id,),
      ).fetchone()
      if not row:
        return None
      unit_rows = conn.execute(
        """
        select unit_id, title, goal, unit_type, order_index, status, result_proposal_id, error_message, artifact_json
        from ai_generation_unit
        where job_id = ?
        order by order_index asc
        """,
        (job_id,),
      ).fetchall()
    units = [
      {
        "unitId": unit_row[0],
        "title": unit_row[1],
        "goal": unit_row[2],
        "unitType": unit_row[3],
        "orderIndex": unit_row[4],
        "status": unit_row[5],
        "resultProposalId": unit_row[6],
        "errorMessage": unit_row[7],
        "artifact": json.loads(unit_row[8]) if unit_row[8] else None,
      }
      for unit_row in unit_rows
    ]
    return GenerationJob.model_validate(
      {
        "jobId": row[0],
        "threadId": row[1],
        "docId": row[2],
        "docType": row[3],
        "baseRevision": row[4],
        "flowType": row[5],
        "goal": row[6],
        "status": row[7],
        "outline": json.loads(row[8]),
        "units": units,
        "createdAt": row[9],
        "updatedAt": row[10],
      }
    )

  def _ensure_parent(self) -> None:
    if self._db_path == ":memory:":
      return
    Path(self._db_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)

  def _connect(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self._db_path)
    conn.execute("pragma journal_mode = wal;")
    conn.execute("pragma foreign_keys = on;")
    return conn

  def _init_schema(self) -> None:
    with self._connect() as conn:
      conn.executescript(
        """
        create table if not exists ai_thread_context (
          thread_id text primary key,
          doc_id text not null,
          doc_type text not null,
          selected_object_ids_json text not null,
          active_section_id text,
          active_slide_id text,
          template_variables_json text not null,
          last_resolved_object_id text,
          current_intent text,
          active_job_id text,
          recent_accepted_proposal_ids_json text not null,
          updated_at text not null
        );

        create table if not exists ai_object_registry_cache (
          doc_id text not null,
          base_revision integer not null,
          snapshot_hash text not null,
          registry_json text not null,
          updated_at text not null,
          primary key (doc_id, base_revision, snapshot_hash)
        );

        create table if not exists ai_patch_proposal (
          proposal_id text primary key,
          thread_id text not null,
          doc_id text not null,
          doc_type text not null,
          base_revision integer not null,
          scope_type text not null,
          scope_id text,
          risk text not null,
          summary text not null,
          explanation_json text not null,
          command_plan_json text not null,
          preview_changed_object_ids_json text not null,
          source text not null,
          accepted integer not null default 0,
          rejected integer not null default 0,
          created_at text not null
        );

        create table if not exists ai_generation_job (
          job_id text primary key,
          thread_id text not null,
          doc_id text not null,
          doc_type text not null,
          base_revision integer not null,
          flow_type text not null,
          goal text not null,
          status text not null,
          outline_json text not null,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists ai_generation_unit (
          unit_id text primary key,
          job_id text not null,
          title text not null,
          goal text not null,
          unit_type text not null,
          order_index integer not null,
          status text not null,
          result_proposal_id text,
          error_message text,
          foreign key(job_id) references ai_generation_job(job_id) on delete cascade
        );
        """
      )
      self._ensure_column(conn, "ai_generation_unit", "artifact_json", "text")

  def _ensure_column(self, conn: sqlite3.Connection, table_name: str, column_name: str, column_sql: str) -> None:
    columns = {
      row[1]
      for row in conn.execute(f"pragma table_info({table_name})").fetchall()
    }
    if column_name in columns:
      return
    conn.execute(f"alter table {table_name} add column {column_name} {column_sql}")
