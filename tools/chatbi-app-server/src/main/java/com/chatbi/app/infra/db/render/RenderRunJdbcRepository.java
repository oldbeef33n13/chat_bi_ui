package com.chatbi.app.infra.db.render;

import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.ArtifactType;
import com.chatbi.app.domain.render.OutputType;
import com.chatbi.app.domain.render.RenderRunRecord;
import com.chatbi.app.domain.render.RunStatus;
import com.chatbi.app.domain.render.RunTriggerType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RenderRunJdbcRepository {

  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
  };

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public RenderRunJdbcRepository(NamedParameterJdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public void insertRun(RenderRunRecord run) {
    String sql = """
      insert into render_run (
        id, trigger_type, template_id, schedule_job_id, template_revision_no, output_type, status, variables_json, started_at, finished_at, error_message, created_at
      ) values (
        :id, :triggerType, :templateId, :scheduleJobId, :templateRevisionNo, :outputType, :status, :variablesJson, :startedAt, :finishedAt, :errorMessage, :createdAt
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", run.id())
      .addValue("triggerType", run.triggerType().value())
      .addValue("templateId", run.templateId())
      .addValue("scheduleJobId", run.scheduleJobId())
      .addValue("templateRevisionNo", run.templateRevisionNo())
      .addValue("outputType", run.outputType().value())
      .addValue("status", run.status().value())
      .addValue("variablesJson", writeJson(run.variables()))
      .addValue("startedAt", stringify(run.startedAt()))
      .addValue("finishedAt", stringify(run.finishedAt()))
      .addValue("errorMessage", run.errorMessage())
      .addValue("createdAt", run.createdAt().toString()));
  }

  public void markRunning(String runId, Instant startedAt) {
    jdbcTemplate.update("""
      update render_run
      set status = :status, started_at = :startedAt
      where id = :id
      """, Map.of("id", runId, "status", RunStatus.RUNNING.value(), "startedAt", startedAt.toString()));
  }

  public void markSucceeded(String runId, Instant finishedAt) {
    jdbcTemplate.update("""
      update render_run
      set status = :status, finished_at = :finishedAt, error_message = null
      where id = :id
      """, Map.of("id", runId, "status", RunStatus.SUCCEEDED.value(), "finishedAt", finishedAt.toString()));
  }

  public void markFailed(String runId, Instant finishedAt, String errorMessage) {
    jdbcTemplate.update("""
      update render_run
      set status = :status, finished_at = :finishedAt, error_message = :errorMessage
      where id = :id
      """, Map.of("id", runId, "status", RunStatus.FAILED.value(), "finishedAt", finishedAt.toString(), "errorMessage", errorMessage));
  }

  public Optional<RenderRunRecord> findRun(String runId) {
    String sql = """
      select id, trigger_type, template_id, schedule_job_id, template_revision_no, output_type, status, variables_json, started_at, finished_at, error_message, created_at
      from render_run
      where id = :id
      """;
    return jdbcTemplate.query(sql, Map.of("id", runId), runRowMapper()).stream().findFirst();
  }

  public List<RenderRunRecord> listRunsByScheduleJob(String scheduleJobId, int limit) {
    return jdbcTemplate.query("""
      select id, trigger_type, template_id, schedule_job_id, template_revision_no, output_type, status, variables_json, started_at, finished_at, error_message, created_at
      from render_run
      where schedule_job_id = :scheduleJobId
      order by created_at desc
      limit :limit
      """, new MapSqlParameterSource()
      .addValue("scheduleJobId", scheduleJobId)
      .addValue("limit", Math.max(1, limit)), runRowMapper());
  }

  public void insertArtifact(ArtifactRecord artifact) {
    jdbcTemplate.update("""
      insert into artifact (
        id, run_id, artifact_type, file_name, file_path, content_type, size_bytes, created_at
      ) values (
        :id, :runId, :artifactType, :fileName, :filePath, :contentType, :sizeBytes, :createdAt
      )
      """, new MapSqlParameterSource()
      .addValue("id", artifact.id())
      .addValue("runId", artifact.runId())
      .addValue("artifactType", artifact.artifactType().value())
      .addValue("fileName", artifact.fileName())
      .addValue("filePath", artifact.filePath())
      .addValue("contentType", artifact.contentType())
      .addValue("sizeBytes", artifact.sizeBytes())
      .addValue("createdAt", artifact.createdAt().toString()));
  }

  public List<ArtifactRecord> listArtifacts(String runId) {
    return jdbcTemplate.query("""
      select id, run_id, artifact_type, file_name, file_path, content_type, size_bytes, created_at
      from artifact
      where run_id = :runId
      order by created_at asc
      """, Map.of("runId", runId), artifactRowMapper());
  }

  public Optional<ArtifactRecord> findArtifact(String artifactId) {
    return jdbcTemplate.query("""
      select id, run_id, artifact_type, file_name, file_path, content_type, size_bytes, created_at
      from artifact
      where id = :id
      """, Map.of("id", artifactId), artifactRowMapper()).stream().findFirst();
  }

  private RowMapper<RenderRunRecord> runRowMapper() {
    return (rs, rowNum) -> new RenderRunRecord(
      rs.getString("id"),
      RunTriggerType.fromValue(rs.getString("trigger_type")),
      rs.getString("template_id"),
      rs.getString("schedule_job_id"),
      rs.getInt("template_revision_no"),
      OutputType.fromValue(rs.getString("output_type")),
      RunStatus.fromValue(rs.getString("status")),
      readVariables(rs.getString("variables_json")),
      parseInstant(rs.getString("started_at")),
      parseInstant(rs.getString("finished_at")),
      rs.getString("error_message"),
      Instant.parse(rs.getString("created_at"))
    );
  }

  private RowMapper<ArtifactRecord> artifactRowMapper() {
    return (rs, rowNum) -> new ArtifactRecord(
      rs.getString("id"),
      rs.getString("run_id"),
      ArtifactType.fromValue(rs.getString("artifact_type")),
      rs.getString("file_name"),
      rs.getString("file_path"),
      rs.getString("content_type"),
      rs.getLong("size_bytes"),
      Instant.parse(rs.getString("created_at"))
    );
  }

  private Map<String, Object> readVariables(String raw) {
    try {
      return raw == null || raw.isBlank() ? Collections.emptyMap() : objectMapper.readValue(raw, MAP_TYPE);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to read run variables JSON", ex);
    }
  }

  private String writeJson(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value == null ? Collections.emptyMap() : value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to write run variables JSON", ex);
    }
  }

  private Instant parseInstant(String raw) {
    return raw == null || raw.isBlank() ? null : Instant.parse(raw);
  }

  private String stringify(Instant instant) {
    return instant == null ? null : instant.toString();
  }
}
