package com.chatbi.app.api.dataendpoint;

import com.chatbi.app.application.dataendpoint.DataEndpointService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/data-endpoints")
public class DataEndpointController {

  private final DataEndpointService dataEndpointService;

  public DataEndpointController(DataEndpointService dataEndpointService) {
    this.dataEndpointService = dataEndpointService;
  }

  @GetMapping
  public DataEndpointPageResponse listEndpoints(
    @RequestParam(defaultValue = "") String q,
    @RequestParam(defaultValue = "all") String category,
    @RequestParam(defaultValue = "all") String providerType,
    @RequestParam(required = false) Boolean enabled
  ) {
    return DataEndpointResponseMapper.toPageResponse(
      dataEndpointService.listEndpoints(q, category, providerType, enabled)
    );
  }

  @PostMapping
  public ResponseEntity<DataEndpointResponse> createEndpoint(@Valid @RequestBody UpsertDataEndpointRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(
      DataEndpointResponseMapper.toResponse(dataEndpointService.createEndpoint(request))
    );
  }

  @GetMapping("/{endpointId}")
  public DataEndpointResponse getEndpoint(@PathVariable String endpointId) {
    return DataEndpointResponseMapper.toResponse(dataEndpointService.getEndpoint(endpointId));
  }

  @PutMapping("/{endpointId}")
  public DataEndpointResponse updateEndpoint(
    @PathVariable String endpointId,
    @Valid @RequestBody UpsertDataEndpointRequest request
  ) {
    return DataEndpointResponseMapper.toResponse(dataEndpointService.updateEndpoint(endpointId, request));
  }

  @PostMapping("/{endpointId}/test")
  public DataEndpointTestResponse testEndpoint(
    @PathVariable String endpointId,
    @RequestBody(required = false) TestDataEndpointRequest request
  ) {
    return DataEndpointResponseMapper.toTestResponse(
      dataEndpointService.testEndpoint(endpointId, request == null ? null : request.params())
    );
  }
}
