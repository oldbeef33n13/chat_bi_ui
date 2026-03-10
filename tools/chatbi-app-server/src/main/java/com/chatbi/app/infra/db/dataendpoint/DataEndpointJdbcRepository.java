package com.chatbi.app.infra.db.dataendpoint;

import com.chatbi.app.domain.dataendpoint.DataEndpointOrigin;
import com.chatbi.app.domain.dataendpoint.DataEndpointProviderType;
import com.chatbi.app.domain.dataendpoint.DataEndpointRecord;
import com.chatbi.app.domain.dataendpoint.EndpointHttpMethod;
import com.fasterxml.jackson.core.JsonProcessingException;
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
public class DataEndpointJdbcRepository {

  private final NamedParameterJdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;

  public DataEndpointJdbcRepository(NamedParameterJdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
  }

  public long countEndpoints() {
    Long count = jdbcTemplate.getJdbcTemplate().queryForObject("select count(1) from data_endpoint", Long.class);
    return count == null ? 0L : count;
  }

  public List<DataEndpointRecord> listEndpoints(String q, String category, String providerType, Boolean enabled) {
    String sql = """
      select id, name, category, provider_type, origin, method, path, description,
             param_schema_json, result_schema_json, sample_request_json, sample_response_json,
             enabled, created_at, updated_at
      from data_endpoint
      %s
      order by case when origin = 'system' then 0 else 1 end asc, category asc, updated_at desc, name asc
      """.formatted(buildWhereClause(q, category, providerType, enabled));
    return jdbcTemplate.query(sql, buildParams(q, category, providerType, enabled), rowMapper());
  }

  public Optional<DataEndpointRecord> findEndpoint(String endpointId) {
    String sql = """
      select id, name, category, provider_type, origin, method, path, description,
             param_schema_json, result_schema_json, sample_request_json, sample_response_json,
             enabled, created_at, updated_at
      from data_endpoint
      where id = :id
      """;
    return jdbcTemplate.query(sql, Map.of("id", endpointId), rowMapper()).stream().findFirst();
  }

  public boolean existsEndpoint(String endpointId) {
    Long count = jdbcTemplate.queryForObject(
      "select count(1) from data_endpoint where id = :id",
      Map.of("id", endpointId),
      Long.class
    );
    return count != null && count > 0;
  }

  public void insertEndpoint(DataEndpointRecord endpoint) {
    String sql = """
      insert into data_endpoint (
        id, name, category, provider_type, origin, method, path, description,
        param_schema_json, result_schema_json, sample_request_json, sample_response_json,
        enabled, created_at, updated_at
      ) values (
        :id, :name, :category, :providerType, :origin, :method, :path, :description,
        :paramSchemaJson, :resultSchemaJson, :sampleRequestJson, :sampleResponseJson,
        :enabled, :createdAt, :updatedAt
      )
      """;
    jdbcTemplate.update(sql, toParams(endpoint));
  }

  public void updateEndpoint(DataEndpointRecord endpoint) {
    String sql = """
      update data_endpoint
      set name = :name,
          category = :category,
          provider_type = :providerType,
          origin = :origin,
          method = :method,
          path = :path,
          description = :description,
          param_schema_json = :paramSchemaJson,
          result_schema_json = :resultSchemaJson,
          sample_request_json = :sampleRequestJson,
          sample_response_json = :sampleResponseJson,
          enabled = :enabled,
          updated_at = :updatedAt
      where id = :id
      """;
    jdbcTemplate.update(sql, toParams(endpoint));
  }

  private String buildWhereClause(String q, String category, String providerType, Boolean enabled) {
    StringBuilder where = new StringBuilder("where 1 = 1");
    if (q != null && !q.isBlank()) {
      where.append(" and (lower(id) like :q or lower(name) like :q or lower(description) like :q)");
    }
    if (!isBlankOrAll(category)) {
      where.append(" and lower(category) = :category");
    }
    if (!isBlankOrAll(providerType)) {
      where.append(" and lower(provider_type) = :providerType");
    }
    if (enabled != null) {
      where.append(" and enabled = :enabled");
    }
    return where.toString();
  }

  private MapSqlParameterSource buildParams(String q, String category, String providerType, Boolean enabled) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    if (q != null && !q.isBlank()) {
      params.addValue("q", "%" + q.trim().toLowerCase() + "%");
    }
    if (!isBlankOrAll(category)) {
      params.addValue("category", category.trim().toLowerCase());
    }
    if (!isBlankOrAll(providerType)) {
      params.addValue("providerType", providerType.trim().toLowerCase());
    }
    if (enabled != null) {
      params.addValue("enabled", enabled ? 1 : 0);
    }
    return params;
  }

  private MapSqlParameterSource toParams(DataEndpointRecord endpoint) {
    return new MapSqlParameterSource()
      .addValue("id", endpoint.id())
      .addValue("name", endpoint.name())
      .addValue("category", endpoint.category())
      .addValue("providerType", endpoint.providerType().value())
      .addValue("origin", endpoint.origin().value())
      .addValue("method", endpoint.method().value())
      .addValue("path", endpoint.path())
      .addValue("description", endpoint.description())
      .addValue("paramSchemaJson", writeJson(endpoint.paramSchema()))
      .addValue("resultSchemaJson", writeJson(endpoint.resultSchema()))
      .addValue("sampleRequestJson", writeJson(endpoint.sampleRequest()))
      .addValue("sampleResponseJson", writeJson(endpoint.sampleResponse()))
      .addValue("enabled", endpoint.enabled() ? 1 : 0)
      .addValue("createdAt", endpoint.createdAt().toString())
      .addValue("updatedAt", endpoint.updatedAt().toString());
  }

  private boolean isBlankOrAll(String value) {
    return value == null || value.isBlank() || "all".equalsIgnoreCase(value.trim());
  }

  private RowMapper<DataEndpointRecord> rowMapper() {
    return (rs, rowNum) -> new DataEndpointRecord(
      rs.getString("id"),
      rs.getString("name"),
      rs.getString("category"),
      DataEndpointProviderType.fromValue(rs.getString("provider_type")),
      DataEndpointOrigin.fromValue(rs.getString("origin")),
      EndpointHttpMethod.fromValue(rs.getString("method")),
      rs.getString("path"),
      rs.getString("description"),
      readJson(rs.getString("param_schema_json")),
      readJson(rs.getString("result_schema_json")),
      readJson(rs.getString("sample_request_json")),
      readJson(rs.getString("sample_response_json")),
      rs.getInt("enabled") == 1,
      Instant.parse(rs.getString("created_at")),
      Instant.parse(rs.getString("updated_at"))
    );
  }

  private JsonNode readJson(String raw) {
    try {
      return objectMapper.readTree(raw);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to read data endpoint JSON", ex);
    }
  }

  private String writeJson(JsonNode value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Failed to write data endpoint JSON", ex);
    }
  }
}
