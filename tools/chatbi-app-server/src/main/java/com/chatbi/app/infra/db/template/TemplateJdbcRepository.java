package com.chatbi.app.infra.db.template;

import com.chatbi.app.domain.template.StoredTemplateState;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateListQuery;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisionEntry;
import com.chatbi.app.domain.template.TemplateType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TemplateJdbcRepository {

  private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
  };

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public TemplateJdbcRepository(NamedParameterJdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public long countTemplates() {
    Long count = jdbcTemplate.getJdbcTemplate().queryForObject("select count(1) from template", Long.class);
    return count == null ? 0L : count;
  }

  public TemplatePage listTemplates(TemplateListQuery query) {
    String whereClause = buildWhereClause(query);
    MapSqlParameterSource params = buildListParams(query);
    String sql = """
      select id, template_type, name, description, tags_json, current_revision, created_at, updated_at
      from template
      %s
      order by updated_at desc
      limit :limit offset :offset
      """.formatted(whereClause);
    List<TemplateMeta> items = jdbcTemplate.query(sql, params, templateMetaRowMapper());

    String countSql = """
      select count(1)
      from template
      %s
      """.formatted(whereClause);
    long total = Optional.ofNullable(jdbcTemplate.queryForObject(countSql, params, Long.class)).orElse(0L);
    return new TemplatePage(items, total, query.page(), query.pageSize());
  }

  public Optional<StoredTemplateState> findTemplateState(String templateId) {
    String sql = """
      select id, template_type, name, description, tags_json, current_revision, created_at, updated_at
      from template
      where id = :id
      """;
    List<StoredTemplateState> rows = jdbcTemplate.query(sql, Map.of("id", templateId), storedTemplateRowMapper());
    return rows.stream().findFirst();
  }

  public Optional<TemplateContent> findContent(String templateId, int revision) {
    String sql = """
      select template_json, revision_no
      from template_revision
      where template_id = :templateId
        and revision_no = :revision
      limit 1
      """;
    List<TemplateContent> rows = jdbcTemplate.query(
      sql,
      Map.of("templateId", templateId, "revision", revision),
      contentRowMapper()
    );
    return rows.stream().findFirst();
  }

  public List<TemplateRevisionEntry> listRevisions(String templateId, int currentRevision) {
    String sql = """
      select revision_no, created_at, created_by
      from template_revision
      where template_id = :templateId
      order by revision_no desc
      """;
    return jdbcTemplate.query(sql, Map.of("templateId", templateId), (rs, rowNum) -> new TemplateRevisionEntry(
      rs.getInt("revision_no"),
      Instant.parse(rs.getString("created_at")),
      rs.getString("created_by"),
      rs.getInt("revision_no") == currentRevision
    ));
  }

  public int findMaxRevisionNumber(String templateId) {
    Integer revision = jdbcTemplate.queryForObject(
      "select coalesce(max(revision_no), 0) from template_revision where template_id = :templateId",
      Map.of("templateId", templateId),
      Integer.class
    );
    return revision == null ? 0 : revision;
  }

  public void insertTemplate(
    String templateId,
    TemplateType templateType,
    String name,
    String description,
    List<String> tags,
    int currentRevision,
    Instant now
  ) {
    String sql = """
      insert into template (
        id, template_type, name, description, tags_json, current_revision, created_at, updated_at
      ) values (
        :id, :templateType, :name, :description, :tagsJson, :currentRevision, :createdAt, :updatedAt
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("templateType", templateType.value())
      .addValue("name", name)
      .addValue("description", description)
      .addValue("tagsJson", writeJson(tags))
      .addValue("currentRevision", currentRevision)
      .addValue("createdAt", now.toString())
      .addValue("updatedAt", now.toString()));
  }

  public void insertRevision(
    String templateId,
    int revision,
    JsonNode dsl,
    Instant now,
    String createdBy
  ) {
    String sql = """
      insert into template_revision (
        template_id, revision_no, template_json, created_at, created_by
      ) values (
        :templateId, :revision, :templateJson, :createdAt, :createdBy
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("templateId", templateId)
      .addValue("revision", revision)
      .addValue("templateJson", writeJson(dsl))
      .addValue("createdAt", now.toString())
      .addValue("createdBy", createdBy));
  }

  public void updateCurrentPointer(
    String templateId,
    int currentRevision,
    String name,
    String description,
    List<String> tags,
    Instant now
  ) {
    String sql = """
      update template
      set current_revision = :currentRevision,
          name = :name,
          description = :description,
          tags_json = :tagsJson,
          updated_at = :updatedAt
      where id = :id
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("currentRevision", currentRevision)
      .addValue("name", name)
      .addValue("description", description)
      .addValue("tagsJson", writeJson(tags))
      .addValue("updatedAt", now.toString()));
  }

  private MapSqlParameterSource buildListParams(TemplateListQuery query) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    params.addValue("limit", query.pageSize());
    params.addValue("offset", Math.max(0, (query.page() - 1) * query.pageSize()));
    if (!isBlankOrAll(query.type())) {
      params.addValue("templateType", query.type().trim().toLowerCase());
    }
    if (query.q() != null && !query.q().isBlank()) {
      params.addValue("q", "%" + query.q().trim().toLowerCase() + "%");
    }
    return params;
  }

  private String buildWhereClause(TemplateListQuery query) {
    StringBuilder where = new StringBuilder("where 1 = 1");
    if (!isBlankOrAll(query.type())) {
      where.append(" and lower(template_type) = :templateType");
    }
    if (query.q() != null && !query.q().isBlank()) {
      where.append(" and (lower(name) like :q or lower(description) like :q or lower(tags_json) like :q)");
    }
    return where.toString();
  }

  private boolean isBlankOrAll(String value) {
    return value == null || value.isBlank() || "all".equalsIgnoreCase(value.trim());
  }

  private RowMapper<TemplateMeta> templateMetaRowMapper() {
    return (rs, rowNum) -> new TemplateMeta(
      rs.getString("id"),
      TemplateType.fromValue(rs.getString("template_type")),
      rs.getString("name"),
      rs.getString("description"),
      readTags(rs.getString("tags_json")),
      Instant.parse(rs.getString("updated_at")),
      rs.getInt("current_revision"),
      true,
      true
    );
  }

  private RowMapper<StoredTemplateState> storedTemplateRowMapper() {
    return (rs, rowNum) -> new StoredTemplateState(
      rs.getString("id"),
      TemplateType.fromValue(rs.getString("template_type")),
      rs.getString("name"),
      rs.getString("description"),
      readTags(rs.getString("tags_json")),
      rs.getInt("current_revision"),
      Instant.parse(rs.getString("created_at")),
      Instant.parse(rs.getString("updated_at"))
    );
  }

  private RowMapper<TemplateContent> contentRowMapper() {
    return (rs, rowNum) -> new TemplateContent(readJson(rs.getString("template_json")), rs.getInt("revision_no"));
  }

  private List<String> readTags(String raw) {
    try {
      return objectMapper.readValue(raw, STRING_LIST);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to read template tags JSON", ex);
    }
  }

  private JsonNode readJson(String raw) {
    try {
      return objectMapper.readTree(raw);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to read template JSON", ex);
    }
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to write JSON", ex);
    }
  }
}
