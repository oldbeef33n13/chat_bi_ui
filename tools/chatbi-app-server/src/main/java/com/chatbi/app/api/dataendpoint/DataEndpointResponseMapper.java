package com.chatbi.app.api.dataendpoint;

import com.chatbi.app.application.dataendpoint.DataEndpointTestResult;
import com.chatbi.app.domain.dataendpoint.DataEndpointRecord;
import java.util.List;

public final class DataEndpointResponseMapper {

  private DataEndpointResponseMapper() {
  }

  public static DataEndpointResponse toResponse(DataEndpointRecord endpoint) {
    return new DataEndpointResponse(
      endpoint.id(),
      endpoint.name(),
      endpoint.category(),
      endpoint.providerType().value(),
      endpoint.origin().value(),
      endpoint.method().value(),
      endpoint.path(),
      endpoint.description(),
      endpoint.paramSchema(),
      endpoint.resultSchema(),
      endpoint.sampleRequest(),
      endpoint.sampleResponse(),
      endpoint.enabled(),
      endpoint.createdAt(),
      endpoint.updatedAt()
    );
  }

  public static DataEndpointPageResponse toPageResponse(List<DataEndpointRecord> endpoints) {
    return new DataEndpointPageResponse(endpoints.stream().map(DataEndpointResponseMapper::toResponse).toList(), endpoints.size());
  }

  public static DataEndpointTestResponse toTestResponse(DataEndpointTestResult result) {
    return new DataEndpointTestResponse(
      result.endpoint().id(),
      result.requestEcho(),
      result.endpoint().resultSchema(),
      result.rows()
    );
  }
}
