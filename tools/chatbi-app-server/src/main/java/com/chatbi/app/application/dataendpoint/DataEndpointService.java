package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.api.dataendpoint.UpsertDataEndpointRequest;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.ConflictException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.domain.dataendpoint.DataEndpointOrigin;
import com.chatbi.app.domain.dataendpoint.DataEndpointProviderType;
import com.chatbi.app.domain.dataendpoint.DataEndpointRecord;
import com.chatbi.app.infra.db.dataendpoint.DataEndpointJdbcRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DataEndpointService {

  private final DataEndpointJdbcRepository dataEndpointRepository;
  private final BuiltInDataEndpointCatalog builtInCatalog;
  private final MockOpsDataService mockOpsDataService;
  private final ObjectMapper objectMapper;

  public DataEndpointService(
    DataEndpointJdbcRepository dataEndpointRepository,
    BuiltInDataEndpointCatalog builtInCatalog,
    MockOpsDataService mockOpsDataService,
    ObjectMapper objectMapper
  ) {
    this.dataEndpointRepository = dataEndpointRepository;
    this.builtInCatalog = builtInCatalog;
    this.mockOpsDataService = mockOpsDataService;
    this.objectMapper = objectMapper;
  }

  public List<DataEndpointRecord> listEndpoints(String q, String category, String providerType, Boolean enabled) {
    return dataEndpointRepository.listEndpoints(q, category, providerType, enabled);
  }

  public DataEndpointRecord getEndpoint(String endpointId) {
    return dataEndpointRepository.findEndpoint(endpointId)
      .orElseThrow(() -> new NotFoundException("数据接口不存在: " + endpointId));
  }

  @Transactional
  public DataEndpointRecord createEndpoint(UpsertDataEndpointRequest request) {
    String endpointId = normalizeId(request.id());
    if (dataEndpointRepository.existsEndpoint(endpointId)) {
      throw new ConflictException("数据接口已存在: " + endpointId);
    }
    DataEndpointRecord endpoint = toRecord(endpointId, request, null);
    dataEndpointRepository.insertEndpoint(endpoint);
    return endpoint;
  }

  @Transactional
  public DataEndpointRecord updateEndpoint(String endpointId, UpsertDataEndpointRequest request) {
    DataEndpointRecord existing = getEndpoint(endpointId);
    DataEndpointRecord endpoint = toRecord(endpointId, request, existing.createdAt());
    dataEndpointRepository.updateEndpoint(endpoint);
    return endpoint;
  }

  public DataEndpointTestResult testEndpoint(String endpointId, Map<String, Object> requestParams) {
    DataEndpointRecord endpoint = getEndpoint(endpointId);
    Map<String, Object> normalizedParams = normalizeParams(requestParams);
    return new DataEndpointTestResult(endpoint, normalizedParams, executeEndpoint(endpoint, normalizedParams));
  }

  public JsonNode executeEndpoint(String endpointId, Map<String, Object> requestParams) {
    return executeEndpoint(getEndpoint(endpointId), normalizeParams(requestParams));
  }

  @Transactional
  public void seedDefaultsIfEmpty() {
    Instant now = Instant.now();
    for (BuiltInDataEndpointDefinition definition : builtInCatalog.definitions()) {
      if (dataEndpointRepository.existsEndpoint(definition.id())) {
        continue;
      }
      Map<String, Object> sampleParams = normalizeParams(objectMapper.convertValue(definition.sampleRequest(), Map.class));
      DataEndpointRecord record = new DataEndpointRecord(
        definition.id(),
        definition.name(),
        definition.category(),
        DataEndpointProviderType.MOCK_REST,
        DataEndpointOrigin.SYSTEM,
        definition.method(),
        definition.path(),
        definition.description(),
        defaultArray(definition.paramSchema()),
        defaultArray(definition.resultSchema()),
        defaultObject(definition.sampleRequest()),
        defaultArray(mockOpsDataService.execute(definition.id(), sampleParams)),
        true,
        now,
        now
      );
      dataEndpointRepository.insertEndpoint(record);
    }
  }

  private JsonNode executeEndpoint(DataEndpointRecord endpoint, Map<String, Object> requestParams) {
    if (!endpoint.enabled()) {
      throw new BadRequestException("数据接口已禁用: " + endpoint.id());
    }
    if (endpoint.providerType() == DataEndpointProviderType.MOCK_REST) {
      return mockOpsDataService.execute(endpoint.id(), requestParams);
    }
    JsonNode sampleResponse = endpoint.sampleResponse();
    if (sampleResponse == null || sampleResponse.isNull()) {
      return objectMapper.createArrayNode();
    }
    if (sampleResponse.isObject() && sampleResponse.has("rows") && sampleResponse.path("rows").isArray()) {
      return sampleResponse.path("rows").deepCopy();
    }
    if (sampleResponse.isArray()) {
      return sampleResponse.deepCopy();
    }
    ArrayNode rows = objectMapper.createArrayNode();
    rows.add(sampleResponse.deepCopy());
    return rows;
  }

  private DataEndpointRecord toRecord(String endpointId, UpsertDataEndpointRequest request, Instant createdAt) {
    Instant now = Instant.now();
    return new DataEndpointRecord(
      endpointId,
      requireNonBlank(request.name(), "name"),
      blankToDefault(request.category(), "custom"),
      request.providerType(),
      request.origin(),
      request.method(),
      requireNonBlank(request.path(), "path"),
      blankToDefault(request.description(), ""),
      defaultArray(request.paramSchema()),
      defaultArray(request.resultSchema()),
      defaultObject(request.sampleRequest()),
      defaultArrayOrWrapped(request.sampleResponse()),
      request.enabled() == null || request.enabled(),
      createdAt == null ? now : createdAt,
      now
    );
  }

  private Map<String, Object> normalizeParams(Map<String, Object> requestParams) {
    if (requestParams == null || requestParams.isEmpty()) {
      return Collections.emptyMap();
    }
    Map<String, Object> normalized = new LinkedHashMap<>();
    requestParams.forEach((key, value) -> {
      if (key != null && !key.isBlank()) {
        normalized.put(key, value);
      }
    });
    return normalized;
  }

  private String normalizeId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "endpoint-" + UUID.randomUUID().toString().substring(0, 8);
    }
    String normalized = raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]+", "-");
    if (normalized.isBlank()) {
      throw new BadRequestException("id 不能为空");
    }
    return normalized;
  }

  private String requireNonBlank(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new BadRequestException(fieldName + " 不能为空");
    }
    return value.trim();
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }

  private JsonNode defaultArray(JsonNode value) {
    if (value != null && value.isArray()) {
      return value.deepCopy();
    }
    return objectMapper.createArrayNode();
  }

  private JsonNode defaultObject(JsonNode value) {
    if (value != null && value.isObject()) {
      return value.deepCopy();
    }
    return objectMapper.createObjectNode();
  }

  private JsonNode defaultArrayOrWrapped(JsonNode value) {
    if (value == null || value.isNull()) {
      return objectMapper.createArrayNode();
    }
    if (value.isArray()) {
      return value.deepCopy();
    }
    if (value.isObject() && value.has("rows") && value.path("rows").isArray()) {
      return value.deepCopy();
    }
    ArrayNode rows = objectMapper.createArrayNode();
    rows.add(value.deepCopy());
    return rows;
  }
}
