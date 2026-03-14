package com.chatbi.app.application.dataendpoint;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class BuiltInDataEndpointCatalog {

  private final List<BuiltInDataEndpointDefinition> definitions;

  public BuiltInDataEndpointCatalog(BuiltInDataEndpointDefinitionFactory factory) {
    this.definitions = List.of(
      factory.opsAlarmTrend(),
      factory.opsIncidentList(),
      factory.opsCapacityTopN(),
      factory.opsTicketSummary(),
      factory.opsChangeCalendar(),
      factory.opsServiceHealth(),
      factory.opsServiceDependencyFlow(),
      factory.opsAlarmDomainMix(),
      factory.opsRegionHealth(),
      factory.opsShiftLoad(),
      factory.opsLinkQualityDetail(),
      factory.opsResourceUsage(),
      factory.opsKpiOverview()
    );
  }

  public List<BuiltInDataEndpointDefinition> definitions() {
    return definitions;
  }

  public Optional<BuiltInDataEndpointDefinition> findById(String endpointId) {
    return definitions.stream().filter(item -> item.id().equals(endpointId)).findFirst();
  }
}
