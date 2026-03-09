package com.chatbi.app.infra.db.template;

import com.chatbi.app.domain.template.RevisionChannel;
import com.chatbi.app.domain.template.StoredTemplateState;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateListQuery;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisions;
import com.chatbi.app.domain.template.TemplateType;
import com.chatbi.app.domain.template.WorkspaceStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
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
      select id, template_type, name, description, status, tags_json, published_revision, draft_revision, created_at, updated_at
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
      select id, template_type, name, description, status, tags_json, published_revision, draft_revision, created_at, updated_at
      from template
      where id = :id
      """;
    List<StoredTemplateState> rows = jdbcTemplate.query(sql, Map.of("id", templateId), storedTemplateRowMapper());
    return rows.stream().findFirst();
  }

  public Optional<TemplateContent> findContent(String templateId, RevisionChannel channel, int revision) {
    String sql = """
      select template_json, revision_no
      from template_revision
      where template_id = :templateId
        and channel = :channel
        and revision_no = :revision
      limit 1
      """;
    List<TemplateContent> rows = jdbcTemplate.query(
      sql,
      Map.of("templateId", templateId, "channel", channel.value(), "revision", revision),
      contentRowMapper()
    );
    return rows.stream().findFirst();
  }

  public boolean existsRevision(String templateId, RevisionChannel channel, int revision) {
    String sql = """
      select count(1)
      from template_revision
      where template_id = :templateId
        and channel = :channel
        and revision_no = :revision
      """;
    Long count = jdbcTemplate.queryForObject(
      sql,
      Map.of("templateId", templateId, "channel", channel.value(), "revision", revision),
      Long.class
    );
    return count != null && count > 0;
  }

  public void insertTemplate(
    String templateId,
    TemplateType templateType,
    String name,
    String description,
    WorkspaceStatus status,
    List<String> tags,
    int publishedRevision,
    int draftRevision,
    Instant now
  ) {
    String sql = """
      insert into template (
        id, template_type, name, description, status, tags_json, published_revision, draft_revision, created_at, updated_at
      ) values (
        :id, :templateType, :name, :description, :status, :tagsJson, :publishedRevision, :draftRevision, :createdAt, :updatedAt
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("templateType", templateType.value())
      .addValue("name", name)
      .addValue("description", description)
      .addValue("status", status.value())
      .addValue("tagsJson", writeJson(tags))
      .addValue("publishedRevision", publishedRevision)
      .addValue("draftRevision", draftRevision)
      .addValue("createdAt", now.toString())
      .addValue("updatedAt", now.toString()));
  }

  public void insertRevision(
    String templateId,
    int revision,
    RevisionChannel channel,
    JsonNode dsl,
    Instant now,
    String createdBy
  ) {
    String sql = """
      insert into template_revision (
        template_id, revision_no, channel, template_json, created_at, created_by
      ) values (
        :templateId, :revision, :channel, :templateJson, :createdAt, :createdBy
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("templateId", templateId)
      .addValue("revision", revision)
      .addValue("channel", channel.value())
      .addValue("templateJson", writeJson(dsl))
      .addValue("createdAt", now.toString())
      .addValue("createdBy", createdBy));
  }

  public void updateDraftPointer(
    String templateId,
    int draftRevision,
    WorkspaceStatus status,
    String name,
    String description,
    List<String> tags,
    Instant now
  ) {
    String sql = """
      update template
      set draft_revision = :draftRevision,
          status = :status,
          name = :name,
          description = :description,
          tags_json = :tagsJson,
          updated_at = :updatedAt
      where id = :id
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("draftRevision", draftRevision)
      .addValue("status", status.value())
      .addValue("name", name)
      .addValue("description", description)
      .addValue("tagsJson", writeJson(tags))
      .addValue("updatedAt", now.toString()));
  }

  public void updatePublishedPointer(
    String templateId,
    int publishedRevision,
    WorkspaceStatus status,
    String name,
    String description,
    List<String> tags,
    Instant now
  ) {
    String sql = """
      update template
      set published_revision = :publishedRevision,
          status = :status,
          name = :name,
          description = :description,
          tags_json = :tagsJson,
          updated_at = :updatedAt
      where id = :id
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("publishedRevision", publishedRevision)
      .addValue("status", status.value())
      .addValue("name", name)
      .addValue("description", description)
      .addValue("tagsJson", writeJson(tags))
      .addValue("updatedAt", now.toString()));
  }

  public void updateDraftAndPublishedPointers(
    String templateId,
    int publishedRevision,
    int draftRevision,
    WorkspaceStatus status,
    String name,
    String description,
    List<String> tags,
    Instant now
  ) {
    String sql = """
      update template
      set published_revision = :publishedRevision,
          draft_revision = :draftRevision,
          status = :status,
          name = :name,
          description = :description,
          tags_json = :tagsJson,
          updated_at = :updatedAt
      where id = :id
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", templateId)
      .addValue("publishedRevision", publishedRevision)
      .addValue("draftRevision", draftRevision)
      .addValue("status", status.value())
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
    if (!isBlankOrAll(query.status())) {
      params.addValue("status", query.status().trim().toLowerCase());
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
    if (!isBlankOrAll(query.status())) {
      where.append(" and lower(status) = :status");
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
      WorkspaceStatus.fromValue(rs.getString("status")),
      true,
      true,
      new TemplateRevisions(rs.getInt("published_revision"), rs.getInt("draft_revision"))
    );
  }

  private RowMapper<StoredTemplateState> storedTemplateRowMapper() {
    return (rs, rowNum) -> new StoredTemplateState(
      rs.getString("id"),
      TemplateType.fromValue(rs.getString("template_type")),
      rs.getString("name"),
      rs.getString("description"),
      readTags(rs.getString("tags_json")),
      WorkspaceStatus.fromValue(rs.getString("status")),
      rs.getInt("published_revision"),
      rs.getInt("draft_revision"),
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
