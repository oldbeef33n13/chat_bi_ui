package com.chatbi.app.infra.db.schedule;

import com.chatbi.app.domain.render.OutputType;
import com.chatbi.app.domain.schedule.ScheduleJobRecord;
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
public class ScheduleJobJdbcRepository {

  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
  };

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public ScheduleJobJdbcRepository(NamedParameterJdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public List<ScheduleJobRecord> listSchedules(String templateId) {
    return jdbcTemplate.query("""
      select id, template_id, name, enabled, cron_expr, timezone, output_type, variables_json, retention_days, last_triggered_at, created_at, updated_at
      from schedule_job
      where template_id = :templateId
      order by updated_at desc
      """, Map.of("templateId", templateId), rowMapper());
  }

  public List<ScheduleJobRecord> listEnabledSchedules() {
    return jdbcTemplate.query("""
      select id, template_id, name, enabled, cron_expr, timezone, output_type, variables_json, retention_days, last_triggered_at, created_at, updated_at
      from schedule_job
      where enabled = 1
      order by updated_at asc
      """, rowMapper());
  }

  public Optional<ScheduleJobRecord> findSchedule(String scheduleId) {
    return jdbcTemplate.query("""
      select id, template_id, name, enabled, cron_expr, timezone, output_type, variables_json, retention_days, last_triggered_at, created_at, updated_at
      from schedule_job
      where id = :id
      """, Map.of("id", scheduleId), rowMapper()).stream().findFirst();
  }

  public void insertSchedule(ScheduleJobRecord schedule) {
    jdbcTemplate.update("""
      insert into schedule_job (
        id, template_id, name, enabled, cron_expr, timezone, output_type, variables_json, retention_days, last_triggered_at, created_at, updated_at
      ) values (
        :id, :templateId, :name, :enabled, :cronExpr, :timezone, :outputType, :variablesJson, :retentionDays, :lastTriggeredAt, :createdAt, :updatedAt
      )
      """, toParams(schedule));
  }

  public void updateSchedule(ScheduleJobRecord schedule) {
    jdbcTemplate.update("""
      update schedule_job
      set template_id = :templateId,
          name = :name,
          enabled = :enabled,
          cron_expr = :cronExpr,
          timezone = :timezone,
          output_type = :outputType,
          variables_json = :variablesJson,
          retention_days = :retentionDays,
          last_triggered_at = :lastTriggeredAt,
          updated_at = :updatedAt
      where id = :id
      """, toParams(schedule));
  }

  public boolean claimTriggered(String scheduleId, Instant expectedLastTriggeredAt, Instant triggerAt, Instant updatedAt) {
    String whereClause = expectedLastTriggeredAt == null ? "last_triggered_at is null" : "last_triggered_at = :expectedLastTriggeredAt";
    int updated = jdbcTemplate.update("""
      update schedule_job
      set last_triggered_at = :triggerAt, updated_at = :updatedAt
      where id = :id and %s
      """.formatted(whereClause), new MapSqlParameterSource()
      .addValue("id", scheduleId)
      .addValue("expectedLastTriggeredAt", stringify(expectedLastTriggeredAt))
      .addValue("triggerAt", stringify(triggerAt))
      .addValue("updatedAt", stringify(updatedAt)));
    return updated > 0;
  }

  private MapSqlParameterSource toParams(ScheduleJobRecord schedule) {
    return new MapSqlParameterSource()
      .addValue("id", schedule.id())
      .addValue("templateId", schedule.templateId())
      .addValue("name", schedule.name())
      .addValue("enabled", schedule.enabled() ? 1 : 0)
      .addValue("cronExpr", schedule.cronExpr())
      .addValue("timezone", schedule.timezone())
      .addValue("outputType", schedule.outputType().value())
      .addValue("variablesJson", writeJson(schedule.variables()))
      .addValue("retentionDays", schedule.retentionDays())
      .addValue("lastTriggeredAt", stringify(schedule.lastTriggeredAt()))
      .addValue("createdAt", stringify(schedule.createdAt()))
      .addValue("updatedAt", stringify(schedule.updatedAt()));
  }

  private RowMapper<ScheduleJobRecord> rowMapper() {
    return (rs, rowNum) -> new ScheduleJobRecord(
      rs.getString("id"),
      rs.getString("template_id"),
      rs.getString("name"),
      rs.getInt("enabled") == 1,
      rs.getString("cron_expr"),
      rs.getString("timezone"),
      OutputType.fromValue(rs.getString("output_type")),
      readVariables(rs.getString("variables_json")),
      rs.getInt("retention_days"),
      parseInstant(rs.getString("last_triggered_at")),
      Instant.parse(rs.getString("created_at")),
      Instant.parse(rs.getString("updated_at"))
    );
  }

  private Map<String, Object> readVariables(String raw) {
    try {
      return raw == null || raw.isBlank() ? Collections.emptyMap() : objectMapper.readValue(raw, MAP_TYPE);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to read schedule variables JSON", ex);
    }
  }

  private String writeJson(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value == null ? Collections.emptyMap() : value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to write schedule variables JSON", ex);
    }
  }

  private Instant parseInstant(String raw) {
    return raw == null || raw.isBlank() ? null : Instant.parse(raw);
  }

  private String stringify(Instant instant) {
    return instant == null ? null : instant.toString();
  }
}
